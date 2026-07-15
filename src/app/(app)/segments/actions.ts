"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireContext } from "@/lib/context";
import {
  parseDefinition,
  evaluateFilter,
  fetchAllEvaluable,
  type EvaluableContact,
  type SegmentDefinition,
} from "@/lib/segments";
import { runImport, type ImportResult } from "@/app/(app)/import/actions";
import type { MappedRow, DedupeMode } from "@/app/(app)/import/fields";

export type SegmentState = { ok?: boolean; error?: string };

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchEvaluable(
  supabase: SupabaseClient,
  orgId: string
): Promise<EvaluableContact[]> {
  // Page past the 1000-row cap so previews/snapshots see every contact.
  return fetchAllEvaluable(supabase, orgId);
}

/** Resolve a definition and replace the segment's cached membership rows. */
async function snapshotMembers(
  supabase: SupabaseClient,
  orgId: string,
  segmentId: string,
  def: SegmentDefinition
): Promise<number> {
  // A filterless segment (e.g. a CSV-imported static list) has no rules to
  // evaluate. Matching an empty definition would select *every* contact and
  // wipe the explicit membership, so leave the existing members untouched.
  if ((def.rules ?? []).length === 0) {
    await supabase
      .from("segments")
      .update({ last_evaluated_at: new Date().toISOString() })
      .eq("id", segmentId);
    const { count } = await supabase
      .from("segment_members")
      .select("id", { count: "exact", head: true })
      .eq("segment_id", segmentId);
    return count ?? 0;
  }

  const contacts = await fetchEvaluable(supabase, orgId);
  const matched = evaluateFilter(contacts, def);

  await supabase.from("segment_members").delete().eq("segment_id", segmentId);
  if (matched.length) {
    await supabase.from("segment_members").insert(
      matched.map((c) => ({
        org_id: orgId,
        segment_id: segmentId,
        contact_id: c.id,
      }))
    );
  }
  await supabase
    .from("segments")
    .update({ last_evaluated_at: new Date().toISOString() })
    .eq("id", segmentId);
  return matched.length;
}

export async function saveSegment(
  _prev: SegmentState,
  fd: FormData
): Promise<SegmentState> {
  const { supabase, org } = await requireContext();

  const id = (fd.get("id") as string) || null;
  const name = String(fd.get("name") ?? "").trim();
  const type = fd.get("type") === "dynamic" ? "dynamic" : "static";
  if (!name) return { error: "Segment name is required." };

  let def: SegmentDefinition;
  try {
    def = parseDefinition(JSON.parse(String(fd.get("definition") ?? "{}")));
  } catch {
    return { error: "Invalid filter definition." };
  }

  let segmentId = id;
  if (id) {
    const { error } = await supabase
      .from("segments")
      .update({ name, type, definition: def })
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from("segments")
      .insert({ org_id: org.id, name, type, definition: def })
      .select("id")
      .single();
    if (error) return { error: error.message };
    segmentId = data.id as string;
  }

  // Populate membership (snapshot for static, initial cache for dynamic).
  await snapshotMembers(supabase, org.id, segmentId!, def);

  revalidatePath("/segments");
  redirect(`/segments/${segmentId}`);
}

export type PreviewContact = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  stage: string;
};

export async function previewSegment(definitionJson: string): Promise<{
  count: number;
  total: number;
  sample: PreviewContact[];
}> {
  const { supabase, org } = await requireContext();
  let def: SegmentDefinition;
  try {
    def = parseDefinition(JSON.parse(definitionJson));
  } catch {
    return { count: 0, total: 0, sample: [] };
  }
  const contacts = await fetchEvaluable(supabase, org.id);
  const matched = evaluateFilter(contacts, def);
  const sample = matched.slice(0, 25).map((c) => ({
    id: c.id,
    name:
      [c.first_name, c.last_name].filter(Boolean).join(" ") ||
      c.email ||
      "Unnamed contact",
    email: c.email,
    company: c.companies?.name ?? null,
    stage: c.lifecycle_stage,
  }));
  return { count: matched.length, total: contacts.length, sample };
}

export async function refreshSnapshot(segmentId: string): Promise<SegmentState> {
  const { supabase, org } = await requireContext();
  const { data: seg } = await supabase
    .from("segments")
    .select("definition")
    .eq("id", segmentId)
    .single();
  if (!seg) return { error: "Segment not found." };

  await snapshotMembers(
    supabase,
    org.id,
    segmentId,
    parseDefinition(seg.definition)
  );
  revalidatePath(`/segments/${segmentId}`);
  revalidatePath("/segments");
  return { ok: true };
}

export async function deleteSegment(id: string): Promise<SegmentState> {
  const { supabase } = await requireContext();
  const { error } = await supabase.from("segments").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/segments");
  return { ok: true };
}

/**
 * Delete a batch of segments in a single query. Called once per chunk by the
 * bulk-task runner; the client refreshes the route once at the end, so this
 * skips per-call revalidation.
 */
export async function bulkDeleteSegments(
  ids: string[]
): Promise<{ ok?: boolean; error?: string; deleted?: number }> {
  if (!ids.length) return { ok: true, deleted: 0 };
  const { supabase } = await requireContext();
  const { error, count } = await supabase
    .from("segments")
    .delete({ count: "exact" })
    .in("id", ids);
  if (error) return { error: error.message };
  return { ok: true, deleted: count ?? ids.length };
}

export type SegmentImportResult = {
  ok?: boolean;
  error?: string;
  segmentId?: string;
  /** How many contacts ended up in the new segment. */
  memberCount?: number;
  /** The underlying contact-import summary (created/updated/skipped/errors). */
  import?: ImportResult;
};

/**
 * Create a static segment from an uploaded CSV of contacts. The rows are run
 * through the normal contact importer (create / match by email, resolve
 * companies), then every contact the file touched is grouped into a new static
 * segment. The segment carries no filter — its membership *is* the imported
 * list, so it's never re-evaluated (see the empty-definition guard above).
 */
export async function importSegmentFromCsv(
  name: string,
  rows: MappedRow[],
  opts: { dedupe: DedupeMode; source: string; filename: string }
): Promise<SegmentImportResult> {
  const { supabase, org } = await requireContext();

  const cleanName = name.trim();
  if (!cleanName) return { error: "Segment name is required." };
  if (!rows.length) return { error: "No rows to import." };

  // 1) Import the contacts, collecting the ids the file touched.
  const imported = await runImport("contacts", rows, opts);
  if (imported.error) return { error: imported.error, import: imported };

  const contactIds = imported.contactIds;

  // 2) Create the static segment (no filter — membership is the imported list).
  const { data: seg, error: segErr } = await supabase
    .from("segments")
    .insert({ org_id: org.id, name: cleanName, type: "static" })
    .select("id")
    .single();
  if (segErr) return { error: segErr.message, import: imported };
  const segmentId = seg.id as string;

  // 3) Attach members. unique(segment_id, contact_id) makes the upsert idempotent.
  for (const part of chunk(contactIds, 500)) {
    const { error } = await supabase.from("segment_members").upsert(
      part.map((cid) => ({
        org_id: org.id,
        segment_id: segmentId,
        contact_id: cid,
      })),
      { onConflict: "segment_id,contact_id", ignoreDuplicates: true }
    );
    if (error) return { error: error.message, segmentId, import: imported };
  }

  await supabase
    .from("segments")
    .update({ last_evaluated_at: new Date().toISOString() })
    .eq("id", segmentId);

  revalidatePath("/segments");
  return {
    ok: true,
    segmentId,
    memberCount: contactIds.length,
    import: imported,
  };
}
