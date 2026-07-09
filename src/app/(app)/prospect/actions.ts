"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";
import {
  getPlacesProvider,
  applyFilters,
  type LatLng,
} from "@/lib/places/provider";
import { discoverEmail } from "@/lib/places/enrich";

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

  const provider = getPlacesProvider();

  const { data: job } = await supabase
    .from("scrape_jobs")
    .insert({
      org_id: org.id,
      user_id: userId,
      provider: provider.name,
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
