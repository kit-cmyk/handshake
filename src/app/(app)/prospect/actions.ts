"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";
import {
  getPlacesProvider,
  isPlacesConfigured,
  applyFilters,
  type LatLng,
} from "@/lib/places/provider";
import { discoverEmail } from "@/lib/places/enrich";
import {
  getContactsProvider,
  applyContactFilters,
  contactPayload,
  type ContactResult,
} from "@/lib/contacts-search/provider";

const ENRICH_CAP = 25; // cap synchronous website fetches per search

/** A found business — carries everything needed to import it later. */
export type LeadResult = {
  placeId: string;
  name: string;
  category: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  rating: number | null;
  lat: number | null;
  lng: number | null;
  email: string | null;
  /** Already in the CRM (matched by place id) — not importable again. */
  existing: boolean;
};

export type SearchState = {
  ok?: boolean;
  error?: string;
  results?: LeadResult[];
  center?: LatLng | null;
  radiusMeters?: number | null;
  jobId?: string | null;
  /** Results are deterministic sample data, not real businesses (dev only). */
  mock?: boolean;
};

export type ImportState = {
  ok?: boolean;
  error?: string;
  imported?: number;
  contacts?: number;
  skipped?: number;
};

/**
 * Search for businesses by conditions. Does NOT write companies — it returns
 * candidates for the user to review and select. Only logs the search itself.
 */
export async function searchLeads(
  _prev: SearchState,
  fd: FormData
): Promise<SearchState> {
  const { supabase, org, userId } = await requireContext();

  const category = String(fd.get("category") ?? "").trim();
  const location = String(fd.get("location") ?? "").trim();
  const limit = Math.min(Math.max(Number(fd.get("limit")) || 20, 1), 60);
  const enrich = fd.get("enrich") === "on";

  const useRadius = fd.get("use_radius") === "on";
  const radiusKm = Math.min(Math.max(Number(fd.get("radius_km")) || 10, 1), 100);
  const radiusMeters = useRadius ? Math.round(radiusKm * 1000) : undefined;
  const minRating = Number(fd.get("min_rating")) || 0;
  const hasWebsite = fd.get("has_website") === "on";
  const hasPhone = fd.get("has_phone") === "on";
  const hasEmail = fd.get("has_email") === "on";
  const openNow = fd.get("open_now") === "on";

  if (!category || !location)
    return { error: "Enter both an industry/category and a location." };

  // Never feed fabricated sample data into a live CRM. Without a Places key the
  // provider is the mock — allowed in dev, refused in production.
  if (!isPlacesConfigured() && process.env.NODE_ENV === "production") {
    return {
      error:
        "Lead search isn’t configured. Set GOOGLE_PLACES_API_KEY to enable prospecting.",
    };
  }

  const provider = getPlacesProvider();

  const { data: job } = await supabase
    .from("scrape_jobs")
    .insert({
      org_id: org.id,
      user_id: userId,
      provider: provider.name,
      kind: "companies",
      category,
      location,
      status: "running",
    })
    .select("id")
    .single();
  const jobId = (job?.id as string | undefined) ?? null;

  try {
    const { center, results } = await provider.search({
      category,
      location,
      limit,
      radiusMeters,
      openNow,
    });

    let candidates = applyFilters(results, { minRating, hasWebsite, hasPhone });

    // Discover emails up front (search-time) when requested, so the review list
    // can show them and importing needs no extra fetches.
    const emailByPlace = new Map<string, string>();
    if (enrich || hasEmail) {
      for (const r of candidates.filter((r) => r.website).slice(0, ENRICH_CAP)) {
        const email = await discoverEmail(r.website);
        if (email) emailByPlace.set(r.placeId, email);
      }
      if (hasEmail)
        candidates = candidates.filter((r) => emailByPlace.has(r.placeId));
    }

    // Flag results already in the CRM.
    const { data: existing } = await supabase
      .from("companies")
      .select("google_place_id")
      .eq("org_id", org.id)
      .not("google_place_id", "is", null);
    const existingIds = new Set(
      (existing ?? []).map(
        (c) => (c as { google_place_id: string }).google_place_id
      )
    );

    const leadResults: LeadResult[] = candidates.map((r) => ({
      placeId: r.placeId,
      name: r.name,
      category: r.category,
      phone: r.phone,
      website: r.website,
      address: r.address,
      city: r.city,
      region: r.region,
      postalCode: r.postalCode,
      rating: r.rating,
      lat: r.latitude,
      lng: r.longitude,
      email: emailByPlace.get(r.placeId) ?? null,
      existing: existingIds.has(r.placeId),
    }));

    const deduped = leadResults.filter((r) => r.existing).length;

    if (jobId) {
      await supabase
        .from("scrape_jobs")
        .update({
          status: "completed",
          requested: leadResults.length,
          deduped,
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }

    revalidatePath("/prospect");
    return {
      ok: true,
      results: leadResults,
      center,
      radiusMeters: radiusMeters ?? null,
      jobId,
      mock: provider.name === "mock",
    };
  } catch (e) {
    const message = (e as Error).message;
    if (jobId) {
      await supabase
        .from("scrape_jobs")
        .update({
          status: "failed",
          error: message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }
    revalidatePath("/prospect");
    return { error: message };
  }
}

/** Import the user-selected businesses into the companies list. */
export async function importLeads(
  jobId: string | null,
  selected: LeadResult[]
): Promise<ImportState> {
  const { supabase, org, userId } = await requireContext();

  if (!selected.length) return { error: "Select at least one company to add." };

  // Re-check what's already in the CRM (guards against races / stale flags).
  const { data: existing } = await supabase
    .from("companies")
    .select("google_place_id")
    .eq("org_id", org.id)
    .not("google_place_id", "is", null);
  const existingIds = new Set(
    (existing ?? []).map((c) => (c as { google_place_id: string }).google_place_id)
  );

  const seen = new Set<string>();
  const fresh = selected.filter((r) => {
    if (!r.placeId || existingIds.has(r.placeId) || seen.has(r.placeId))
      return false;
    seen.add(r.placeId);
    return true;
  });
  const skipped = selected.length - fresh.length;

  if (!fresh.length) return { ok: true, imported: 0, contacts: 0, skipped };

  const { data: inserted, error } = await supabase
    .from("companies")
    .insert(
      fresh.map((r) => ({
        org_id: org.id,
        name: r.name,
        category: r.category,
        phone: r.phone,
        website: r.website,
        address: r.address,
        city: r.city,
        region: r.region,
        postal_code: r.postalCode,
        google_place_id: r.placeId,
        rating: r.rating,
        latitude: r.lat,
        longitude: r.lng,
        source: "google_places",
      }))
    )
    .select("id, google_place_id");
  if (error) return { error: error.message };

  // Create a contact for any selected business we already found an email for.
  const emailByPlace = new Map(
    fresh.filter((r) => r.email).map((r) => [r.placeId, r.email as string])
  );
  let contacts = 0;
  for (const co of (inserted ?? []) as {
    id: string;
    google_place_id: string | null;
  }[]) {
    const email = co.google_place_id
      ? emailByPlace.get(co.google_place_id)
      : undefined;
    if (!email) continue;
    const { error: cErr } = await supabase.from("contacts").insert({
      org_id: org.id,
      company_id: co.id,
      email,
      lifecycle_stage: "new",
      owner_id: userId,
      source: "google_places",
    });
    if (!cErr) contacts++;
  }

  const imported = inserted?.length ?? 0;

  if (jobId) {
    await supabase
      .from("scrape_jobs")
      .update({ imported, contacts })
      .eq("id", jobId);
  }

  revalidatePath("/companies");
  revalidatePath("/prospect");
  if (contacts) revalidatePath("/contacts");

  return { ok: true, imported, contacts, skipped };
}

// ---- People / contact search ------------------------------------------------

/** A found person — carries everything needed to import them later. */
export type ContactLeadResult = {
  externalId: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  domain: string | null;
  city: string | null;
  region: string | null;
  linkedinUrl: string | null;
  /** Already in the CRM (matched by email) — not importable again. */
  existing: boolean;
};

export type ContactSearchState = {
  ok?: boolean;
  error?: string;
  results?: ContactLeadResult[];
  jobId?: string | null;
};

export type ContactImportState = {
  ok?: boolean;
  error?: string;
  imported?: number;
  linked?: number;
  skipped?: number;
};

/**
 * Search for people by role/title, optionally anchored to a company/location.
 * Does NOT write contacts — returns candidates for the user to review. Only
 * logs the search itself (reusing scrape_jobs with kind='contacts').
 */
export async function searchContacts(
  _prev: ContactSearchState,
  fd: FormData
): Promise<ContactSearchState> {
  const { supabase, org, userId } = await requireContext();

  const title = String(fd.get("title") ?? "").trim();
  const location = String(fd.get("location") ?? "").trim();
  const company = String(fd.get("company") ?? "").trim();
  const seniority = String(fd.get("seniority") ?? "").trim();
  const department = String(fd.get("department") ?? "").trim();
  const limit = Math.min(Math.max(Number(fd.get("limit")) || 20, 1), 60);
  const hasEmail = fd.get("has_email") === "on";

  if (!title) return { error: "Enter a role or job title to search for." };

  const provider = getContactsProvider();

  const { data: job } = await supabase
    .from("scrape_jobs")
    .insert({
      org_id: org.id,
      user_id: userId,
      provider: provider.name,
      kind: "contacts",
      category: title,
      location: location || company || "—",
      status: "running",
    })
    .select("id")
    .single();
  const jobId = (job?.id as string | undefined) ?? null;

  try {
    const results = await provider.search({
      title,
      location: location || undefined,
      company: company || undefined,
      seniority: seniority || undefined,
      department: department || undefined,
      limit,
      hasEmail,
    });

    const candidates = applyContactFilters(results, { hasEmail });

    // Flag people already in the CRM (matched by email).
    const emails = candidates
      .map((r) => r.email?.toLowerCase())
      .filter((e): e is string => !!e);
    const existingEmails = new Set<string>();
    if (emails.length) {
      const { data: existing } = await supabase
        .from("contacts")
        .select("email")
        .eq("org_id", org.id)
        .in("email", emails);
      for (const c of existing ?? [])
        if ((c as { email: string | null }).email)
          existingEmails.add((c as { email: string }).email.toLowerCase());
    }

    const leadResults: ContactLeadResult[] = candidates.map((r) => ({
      externalId: r.externalId,
      firstName: r.firstName,
      lastName: r.lastName,
      title: r.title,
      email: r.email,
      phone: r.phone,
      companyName: r.companyName,
      domain: r.domain,
      city: r.city,
      region: r.region,
      linkedinUrl: r.linkedinUrl,
      existing: r.email ? existingEmails.has(r.email.toLowerCase()) : false,
    }));

    const deduped = leadResults.filter((r) => r.existing).length;

    if (jobId) {
      await supabase
        .from("scrape_jobs")
        .update({
          status: "completed",
          requested: leadResults.length,
          deduped,
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }

    revalidatePath("/prospect");
    return { ok: true, results: leadResults, jobId };
  } catch (e) {
    const message = (e as Error).message;
    if (jobId) {
      await supabase
        .from("scrape_jobs")
        .update({
          status: "failed",
          error: message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }
    revalidatePath("/prospect");
    return { error: message };
  }
}

/** Import the user-selected people into the contacts list. */
export async function importContacts(
  jobId: string | null,
  selected: ContactLeadResult[]
): Promise<ContactImportState> {
  const { supabase, org, userId } = await requireContext();

  if (!selected.length) return { error: "Select at least one person to add." };

  // Re-check what's already in the CRM (guards against races / stale flags).
  const emails = selected
    .map((r) => r.email?.toLowerCase())
    .filter((e): e is string => !!e);
  const existingEmails = new Set<string>();
  if (emails.length) {
    const { data: existing } = await supabase
      .from("contacts")
      .select("email")
      .eq("org_id", org.id)
      .in("email", emails);
    for (const c of existing ?? [])
      if ((c as { email: string | null }).email)
        existingEmails.add((c as { email: string }).email.toLowerCase());
  }

  const seen = new Set<string>();
  const fresh = selected.filter((r) => {
    const key = r.email?.toLowerCase() || r.externalId;
    if (!key || seen.has(key)) return false;
    if (r.email && existingEmails.has(r.email.toLowerCase())) return false;
    seen.add(key);
    return true;
  });
  const skipped = selected.length - fresh.length;

  if (!fresh.length) return { ok: true, imported: 0, linked: 0, skipped };

  // Link to an existing company by name (best-effort). We don't auto-create
  // companies here — a null company_id is fine and avoids junk records.
  const names = Array.from(
    new Set(fresh.map((r) => r.companyName).filter((n): n is string => !!n))
  );
  const companyByName = new Map<string, string>();
  if (names.length) {
    const { data: cos } = await supabase
      .from("companies")
      .select("id, name")
      .eq("org_id", org.id)
      .in("name", names);
    for (const co of (cos ?? []) as { id: string; name: string }[])
      companyByName.set(co.name.toLowerCase(), co.id);
  }

  const rows = fresh.map((r) =>
    contactPayload(
      r as ContactResult,
      org.id,
      userId,
      r.companyName ? companyByName.get(r.companyName.toLowerCase()) ?? null : null
    )
  );

  const { data: inserted, error } = await supabase
    .from("contacts")
    .insert(rows)
    .select("id, company_id");
  if (error) return { error: error.message };

  const imported = inserted?.length ?? 0;
  const linked = (inserted ?? []).filter(
    (c) => (c as { company_id: string | null }).company_id
  ).length;

  if (jobId) {
    await supabase
      .from("scrape_jobs")
      .update({ imported, contacts: imported })
      .eq("id", jobId);
  }

  revalidatePath("/contacts");
  revalidatePath("/prospect");

  return { ok: true, imported, linked, skipped };
}
