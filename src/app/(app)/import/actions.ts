"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";
import { fetchAllRows } from "@/lib/supabase/paginate";
import {
  validateRow,
  type Target,
  type MappedRow,
  type DedupeMode,
  type RowIssue,
} from "./fields";
import {
  LIFECYCLE_STAGES,
  type ContactWithCompany,
  type LifecycleStage,
} from "@/lib/types";
import {
  detectIssues,
  summarize,
  type ContactIssueSummary,
} from "@/lib/data-quality";

const MAX_ROWS = 10000;
const CHUNK = 500;

export type ImportResult = {
  ok?: boolean;
  error?: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errored: number;
  errors: RowIssue[];
  /** Data-health snapshot of the affected data after import (contacts only). */
  issues?: ContactIssueSummary | null;
  /**
   * IDs of every contact an import touched — newly created, updated, or matched
   * as an existing duplicate. Empty for company imports. Lets callers (e.g. the
   * "segment from CSV" flow) group the imported people without a second query.
   */
  contactIds: string[];
};

const empty: ImportResult = {
  total: 0,
  created: 0,
  updated: 0,
  skipped: 0,
  errored: 0,
  errors: [],
  contactIds: [],
};

function clean(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

function toNumber(v: string | undefined): number | null {
  const s = clean(v);
  if (s === null) return null;
  const n = Number(s.replace(/[,$]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function runImport(
  target: Target,
  rows: MappedRow[],
  opts: { dedupe: DedupeMode; source: string; filename: string }
): Promise<ImportResult> {
  const { supabase, org, userId } = await requireContext();
  const result: ImportResult = { ...empty, total: rows.length, errors: [] };
  // Contacts touched by this import (created / updated / matched-existing).
  const affectedContactIds = new Set<string>();

  if (!rows.length) return { ...result, error: "No rows to import." };
  if (rows.length > MAX_ROWS)
    return { ...result, error: `Too many rows (max ${MAX_ROWS}).` };

  const source = opts.source || "csv";

  // 1) Validate — separate good rows (keep 1-based row number) from errors.
  const valid: { r: MappedRow; row: number }[] = [];
  rows.forEach((r, i) => {
    const err = validateRow(target, r);
    if (err) {
      result.errored++;
      result.errors.push({ row: i + 1, message: err });
    } else {
      valid.push({ r, row: i + 1 });
    }
  });

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; payload: Record<string, unknown> }[] = [];

  if (target === "contacts") {
    // Resolve / create companies referenced by name.
    const companyByName = new Map<string, string>();
    const referenced = [
      ...new Set(
        valid.map((v) => clean(v.r.company_name)).filter((n): n is string => !!n)
      ),
    ];
    if (referenced.length) {
      const existing = await fetchAllRows<{ id: string; name: string }>(
        (from, to) =>
          supabase
            .from("companies")
            .select("id, name")
            .eq("org_id", org.id)
            .range(from, to)
      );
      for (const c of existing)
        companyByName.set((c.name as string).toLowerCase(), c.id as string);

      const missing = referenced.filter(
        (n) => !companyByName.has(n.toLowerCase())
      );
      if (missing.length) {
        const { data: made } = await supabase
          .from("companies")
          .insert(missing.map((n) => ({ org_id: org.id, name: n, source })))
          .select("id, name");
        for (const c of made ?? [])
          companyByName.set((c.name as string).toLowerCase(), c.id as string);
      }
    }

    // Existing contacts keyed by email for dedupe. Page past the row cap so
    // re-imports don't create duplicates on large books.
    const emailToId = new Map<string, string>();
    const existingContacts = await fetchAllRows<{ id: string; email: string }>(
      (from, to) =>
        supabase
          .from("contacts")
          .select("id, email")
          .eq("org_id", org.id)
          .not("email", "is", null)
          .range(from, to)
    );
    for (const c of existingContacts)
      emailToId.set((c.email as string).toLowerCase(), c.id as string);

    for (const { r } of valid) {
      const stageRaw = clean(r.lifecycle_stage);
      const lifecycle_stage: LifecycleStage =
        stageRaw && LIFECYCLE_STAGES.includes(stageRaw as LifecycleStage)
          ? (stageRaw as LifecycleStage)
          : "new";
      const cname = clean(r.company_name);
      const payload = {
        org_id: org.id,
        first_name: clean(r.first_name),
        last_name: clean(r.last_name),
        email: clean(r.email),
        phone: clean(r.phone),
        title: clean(r.title),
        lifecycle_stage,
        owner_id: userId,
        source,
        lead_source: clean(r.lead_source),
        address: clean(r.address),
        address_line2: clean(r.address_line2),
        city: clean(r.city),
        region: clean(r.region),
        postal_code: clean(r.postal_code),
        country: clean(r.country),
        company_id: cname ? companyByName.get(cname.toLowerCase()) ?? null : null,
      };
      const email = payload.email?.toLowerCase();
      if (email && emailToId.has(email)) {
        const existingId = emailToId.get(email)!;
        // Matched an existing contact — it belongs in any segment built from
        // this file regardless of whether we skip or update its fields.
        affectedContactIds.add(existingId);
        if (opts.dedupe === "skip") {
          result.skipped++;
          continue;
        }
        if (opts.dedupe === "update") {
          toUpdate.push({ id: existingId, payload });
          continue;
        }
      }
      toInsert.push(payload);
    }
  } else {
    // Companies — dedupe by domain.
    const domainToId = new Map<string, string>();
    const existingCompanies = await fetchAllRows<{ id: string; domain: string }>(
      (from, to) =>
        supabase
          .from("companies")
          .select("id, domain")
          .eq("org_id", org.id)
          .not("domain", "is", null)
          .range(from, to)
    );
    for (const c of existingCompanies)
      domainToId.set((c.domain as string).toLowerCase(), c.id as string);

    for (const { r } of valid) {
      const payload = {
        org_id: org.id,
        name: clean(r.name),
        industry: clean(r.industry),
        category: clean(r.category),
        website: clean(r.website),
        domain: clean(r.domain),
        phone: clean(r.phone),
        city: clean(r.city),
        region: clean(r.region),
        linkedin_url: clean(r.linkedin_url),
        employee_count: toNumber(r.employee_count),
        annual_revenue: toNumber(r.annual_revenue),
        source,
      };
      const domain = payload.domain?.toLowerCase();
      if (domain && domainToId.has(domain)) {
        if (opts.dedupe === "skip") {
          result.skipped++;
          continue;
        }
        if (opts.dedupe === "update") {
          toUpdate.push({ id: domainToId.get(domain)!, payload });
          continue;
        }
      }
      toInsert.push(payload);
    }
  }

  // 2) Apply inserts (chunked) + updates. Select ids back so contact imports
  //    can report exactly which people were created.
  for (const part of chunk(toInsert, CHUNK)) {
    const { data, error } = await supabase
      .from(target)
      .insert(part)
      .select("id");
    if (error) {
      result.errored += part.length;
      result.errors.push({ row: 0, message: `Insert failed: ${error.message}` });
    } else {
      const inserted = data ?? [];
      result.created += inserted.length;
      if (target === "contacts")
        for (const row of inserted)
          affectedContactIds.add((row as { id: string }).id);
    }
  }

  for (const u of toUpdate) {
    const { error } = await supabase
      .from(target)
      .update(u.payload)
      .eq("id", u.id);
    if (error) {
      result.errored++;
      result.errors.push({ row: 0, message: `Update failed: ${error.message}` });
    } else {
      result.updated++;
      if (target === "contacts") affectedContactIds.add(u.id);
    }
  }

  // 3) Record the batch (cap stored errors).
  await supabase.from("import_batches").insert({
    org_id: org.id,
    target,
    source,
    filename: opts.filename,
    total: result.total,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    errored: result.errored,
    errors: result.errors.slice(0, 200),
    created_by: userId,
  });

  // Post-ingest data-health check so issues surface on the upload itself.
  if (target === "contacts") {
    const allContacts = await fetchAllRows<ContactWithCompany>((from, to) =>
      supabase
        .from("contacts")
        .select("*, companies(id, name)")
        .eq("org_id", org.id)
        .range(from, to)
    );
    result.issues = summarize(detectIssues(allContacts));
  }

  revalidatePath("/import");
  revalidatePath(`/${target}`);
  revalidatePath("/contacts/issues");
  result.contactIds = [...affectedContactIds];
  result.ok = true;
  return result;
}
