"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireContext } from "@/lib/context";
import { inngest } from "@/lib/inngest/client";
import {
  parseDefinition,
  evaluateFilter,
  fetchAllEvaluable,
  fetchSegmentMemberIds,
  replaceSegmentMembers,
  isDefinitionValid,
  definitionErrors,
  chunk,
  MEMBER_WRITE_CHUNK,
  type EvaluableContact,
  type Segment,
  type SegmentDefinition,
  type SegmentType,
} from "@/lib/segments";
import { runImport, type ImportResult } from "@/app/(app)/import/actions";
import type { MappedRow, DedupeMode } from "@/app/(app)/import/fields";

export type SegmentState = { ok?: boolean; error?: string; id?: string };

/** A segment id list is only ever this long per event payload. */
const EVENT_ID_CHUNK = 1000;

function message(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `%` and `_` are LIKE wildcards — a segment literally named "50% off" must
 *  not match "50Z off". PostgREST has no escape clause here, so strip them. */
function likeSafe(value: string): string {
  return value.replace(/[%_]/g, "");
}

/**
 * Load a segment the caller is allowed to act on. RLS already hides other
 * tenants, but a user who belongs to two orgs would otherwise be able to drive
 * a segment from org B while the active context (and therefore every
 * `segment_members.org_id` we write) says org A. Managed segments back a live
 * campaign audience and are never editable by hand.
 */
async function loadOwnedSegment(
  supabase: SupabaseClient,
  orgId: string,
  id: string,
  opts: { allowManaged?: boolean } = {}
): Promise<{ segment?: Segment; error?: string }> {
  if (!id) return { error: "Segment not found." };
  const { data } = await supabase
    .from("segments")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) return { error: "Segment not found." };
  const segment = data as Segment;
  if (segment.managed && !opts.allowManaged)
    return {
      error:
        "This list is managed by a campaign. Edit it from the campaign's audience step instead.",
    };
  return { segment };
}

/**
 * Announce a membership change so the same downstream triggers fire whether the
 * change came from the hourly cron, a manual refresh, a CSV import, or a
 * workflow. Without this, `segment_entry` workflows and segment-audience
 * campaigns only ever reacted to the cron — so static segments never triggered
 * anything at all.
 */
async function emitMembersChanged(
  orgId: string,
  segmentId: string,
  added: string[],
  removed: string[]
): Promise<void> {
  if (!added.length && !removed.length) return;
  // Chunked so a bulk import doesn't push a single oversized event payload.
  const batches = Math.max(
    chunk(added, EVENT_ID_CHUNK).length,
    chunk(removed, EVENT_ID_CHUNK).length
  );
  const addedParts = chunk(added, EVENT_ID_CHUNK);
  const removedParts = chunk(removed, EVENT_ID_CHUNK);
  const events = Array.from({ length: batches }, (_, i) => ({
    name: "segment/members.changed",
    data: {
      segmentId,
      orgId,
      added: addedParts[i] ?? [],
      removed: removedParts[i] ?? [],
    },
  }));
  await inngest.send(events);
}

/** Resolve a definition and replace the segment's cached membership rows. */
async function snapshotMembers(
  supabase: SupabaseClient,
  orgId: string,
  segmentId: string,
  type: SegmentType,
  def: SegmentDefinition
): Promise<{ count: number; added: string[]; removed: string[] }> {
  const before = await fetchSegmentMemberIds(supabase, orgId, {
    id: segmentId,
    // Always the cached rows: this is the membership we're about to replace,
    // whatever the segment's own type says.
    type: "static",
    definition: def,
  });

  // A filterless *static* segment is an explicit list — a CSV import, or people
  // added by hand. It has no rules to evaluate, and matching an empty
  // definition would select every contact and wipe that list, so leave it be.
  // A filterless dynamic segment genuinely does mean "everyone", which is what
  // the hourly cron writes for it, so it falls through and snapshots normally.
  if (type === "static" && (def.rules ?? []).length === 0) {
    const { error } = await supabase
      .from("segments")
      .update({ last_evaluated_at: new Date().toISOString() })
      .eq("id", segmentId);
    if (error) throw new Error(error.message);
    return { count: before.length, added: [], removed: [] };
  }

  const contacts = await fetchAllEvaluable(supabase, orgId);
  const matched = evaluateFilter(contacts, def);
  const matchedIds = matched.map((c) => c.id);

  await replaceSegmentMembers(supabase, orgId, segmentId, matchedIds);

  const beforeSet = new Set(before);
  const afterSet = new Set(matchedIds);
  const added = matchedIds.filter((id) => !beforeSet.has(id));
  const removed = before.filter((id) => !afterSet.has(id));

  const { error } = await supabase
    .from("segments")
    .update({ last_evaluated_at: new Date().toISOString() })
    .eq("id", segmentId);
  if (error) throw new Error(error.message);

  return { count: matchedIds.length, added, removed };
}

/** Reject a name that already belongs to another segment in the org. */
async function nameTaken(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  exceptId: string | null
): Promise<boolean> {
  let q = supabase
    .from("segments")
    .select("id")
    .eq("org_id", orgId)
    .eq("managed", false)
    .ilike("name", likeSafe(name));
  if (exceptId) q = q.neq("id", exceptId);
  const { data } = await q.limit(1);
  return !!data?.length;
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

  // Server actions are public endpoints — re-run the builder's rule validation
  // here so a half-configured rule (which matches nobody, or everybody) can't
  // be posted straight past the UI.
  if (!isDefinitionValid(def)) {
    const first = definitionErrors(def).flat()[0];
    return { error: first ?? "Finish configuring every condition." };
  }

  if (await nameTaken(supabase, org.id, name, id))
    return { error: "A segment with that name already exists." };

  let segmentId = id;
  if (id) {
    const { segment, error } = await loadOwnedSegment(supabase, org.id, id);
    if (error || !segment) return { error };
    const { error: updErr } = await supabase
      .from("segments")
      .update({ name, type, definition: def })
      .eq("id", id)
      .eq("org_id", org.id);
    if (updErr) return { error: updErr.message };
  } else {
    const { data, error } = await supabase
      .from("segments")
      .insert({ org_id: org.id, name, type, definition: def, managed: false })
      .select("id")
      .single();
    if (error) return { error: error.message };
    segmentId = data.id as string;
  }

  // Populate membership (snapshot for static, initial cache for dynamic).
  try {
    const { added, removed } = await snapshotMembers(
      supabase,
      org.id,
      segmentId!,
      type,
      def
    );
    await emitMembersChanged(org.id, segmentId!, added, removed);
  } catch (e) {
    return { error: message(e) };
  }

  revalidatePath("/segments");
  revalidatePath(`/segments/${segmentId}`);
  return { ok: true, id: segmentId! };
}

export type PreviewContact = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  stage: string;
};

export type SegmentPreview = {
  count: number;
  total: number;
  sample: PreviewContact[];
  /** Set when the preview could not be computed — distinct from "0 matched". */
  error?: string;
};

export async function previewSegment(
  definitionJson: string
): Promise<SegmentPreview> {
  const { supabase, org } = await requireContext();
  let def: SegmentDefinition;
  try {
    def = parseDefinition(JSON.parse(definitionJson));
  } catch {
    return { count: 0, total: 0, sample: [], error: "Invalid filter." };
  }
  try {
    const contacts = await fetchAllEvaluable(supabase, org.id);
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
  } catch (e) {
    return { count: 0, total: 0, sample: [], error: message(e) };
  }
}

export async function refreshSnapshot(segmentId: string): Promise<SegmentState> {
  const { supabase, org } = await requireContext();
  const { segment, error } = await loadOwnedSegment(supabase, org.id, segmentId);
  if (error || !segment) return { error };

  try {
    const { added, removed } = await snapshotMembers(
      supabase,
      org.id,
      segmentId,
      segment.type,
      parseDefinition(segment.definition)
    );
    await emitMembersChanged(org.id, segmentId, added, removed);
  } catch (e) {
    return { error: message(e) };
  }

  revalidatePath(`/segments/${segmentId}`);
  revalidatePath("/segments");
  return { ok: true };
}

/** Campaigns and workflows that break if a segment disappears. */
export type SegmentUsage = {
  campaigns: { id: string; name: string; status: string }[];
  workflows: { id: string; name: string; status: string }[];
};

export async function getSegmentUsage(
  segmentId: string
): Promise<SegmentUsage> {
  const { supabase, org } = await requireContext();
  const empty: SegmentUsage = { campaigns: [], workflows: [] };
  // The id is interpolated into a PostgREST `or()` filter below, so it has to
  // be a literal uuid and nothing else.
  if (!UUID.test(segmentId)) return empty;

  const [{ data: campaigns }, { data: workflows }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, status, segment_id, exclude_segment_id")
      .eq("org_id", org.id)
      .or(`segment_id.eq.${segmentId},exclude_segment_id.eq.${segmentId}`),
    supabase
      .from("workflows")
      .select("id, name, status, trigger_type, trigger_config, graph")
      .eq("org_id", org.id),
  ]);

  // A workflow references a segment through its trigger config or through any
  // `add_to_segment` / exit-criteria node in its graph, so the graph has to be
  // scanned rather than filtered in SQL.
  const referencing = (workflows ?? []).filter((w) => {
    const row = w as {
      trigger_config?: { segmentId?: string } | null;
      graph?: { nodes?: { data?: { config?: Record<string, unknown> } }[] } | null;
    };
    if (row.trigger_config?.segmentId === segmentId) return true;
    return (row.graph?.nodes ?? []).some(
      (n) => n?.data?.config?.segmentId === segmentId
    );
  });

  return {
    campaigns: (campaigns ?? []).map((c) => ({
      id: (c as { id: string }).id,
      name: (c as { name: string }).name,
      status: (c as { status: string }).status,
    })),
    workflows: referencing.map((w) => ({
      id: (w as { id: string }).id,
      name: (w as { name: string }).name,
      status: (w as { status: string }).status,
    })),
  };
}

export async function deleteSegment(id: string): Promise<SegmentState> {
  const { supabase, org } = await requireContext();
  const { segment, error } = await loadOwnedSegment(supabase, org.id, id);
  if (error || !segment) return { error };

  const { error: delErr } = await supabase
    .from("segments")
    .delete()
    .eq("id", id)
    .eq("org_id", org.id);
  if (delErr) return { error: delErr.message };
  revalidatePath("/segments");
  return { ok: true };
}

/**
 * Delete a batch of segments in a single query. Called once per chunk by the
 * bulk-task runner; the client refreshes the route once at the end, so this
 * skips per-call revalidation. Managed segments are filtered out rather than
 * failing the batch — they're never selectable in the UI to begin with.
 */
export async function bulkDeleteSegments(
  ids: string[]
): Promise<{ ok?: boolean; error?: string; deleted?: number }> {
  if (!ids.length) return { ok: true, deleted: 0 };
  const { supabase, org } = await requireContext();
  const { error, count } = await supabase
    .from("segments")
    .delete({ count: "exact" })
    .eq("org_id", org.id)
    .eq("managed", false)
    .in("id", ids);
  if (error) return { error: error.message };
  return { ok: true, deleted: count ?? 0 };
}

/**
 * Copy a segment, filter and all. A static copy also copies the explicit
 * membership, so duplicating a CSV-imported list gives you the same people
 * rather than an empty shell.
 */
export async function duplicateSegment(id: string): Promise<SegmentState> {
  const { supabase, org } = await requireContext();
  const { segment, error } = await loadOwnedSegment(supabase, org.id, id);
  if (error || !segment) return { error };

  // "Name", "Name (copy)", "Name (copy 2)" — first free slot.
  const base = `${segment.name} (copy)`;
  let name = base;
  for (let n = 2; await nameTaken(supabase, org.id, name, null); n++) {
    name = `${segment.name} (copy ${n})`;
    if (n > 50) return { error: "Too many copies of that segment already." };
  }

  const { data: created, error: insErr } = await supabase
    .from("segments")
    .insert({
      org_id: org.id,
      name,
      type: segment.type,
      definition: segment.definition,
      managed: false,
    })
    .select("id")
    .single();
  if (insErr) return { error: insErr.message };
  const newId = created.id as string;

  try {
    const memberIds = await fetchSegmentMemberIds(supabase, org.id, segment);
    await replaceSegmentMembers(supabase, org.id, newId, memberIds);
    await supabase
      .from("segments")
      .update({ last_evaluated_at: new Date().toISOString() })
      .eq("id", newId);
    await emitMembersChanged(org.id, newId, memberIds, []);
  } catch (e) {
    return { error: message(e) };
  }

  revalidatePath("/segments");
  return { ok: true, id: newId };
}

// ---------------------------------------------------------------------------
// Static membership editing
// ---------------------------------------------------------------------------

/**
 * Add contacts to a static segment. Used by the segment detail page and by the
 * contacts table's bulk action. Idempotent — unique(segment_id, contact_id)
 * makes re-adding a member a no-op rather than an error.
 */
export async function addContactsToSegment(
  segmentId: string,
  contactIds: string[]
): Promise<{ ok?: boolean; error?: string; added?: number }> {
  const { supabase, org } = await requireContext();
  if (!contactIds.length) return { ok: true, added: 0 };

  const { segment, error } = await loadOwnedSegment(supabase, org.id, segmentId);
  if (error || !segment) return { error };
  if (segment.type === "dynamic")
    return {
      error:
        "This segment is dynamic — its members come from the filter. Convert it to static to add people by hand.",
    };

  // Only contacts this org actually owns. RLS hides foreign rows on read, but
  // INSERT's WITH CHECK only validates the new row's own org_id, so a forged
  // contact id would otherwise be linked in.
  const owned = new Set<string>();
  for (const part of chunk(contactIds, MEMBER_WRITE_CHUNK)) {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("org_id", org.id)
      .in("id", part);
    for (const row of data ?? []) owned.add((row as { id: string }).id);
  }
  const valid = contactIds.filter((id) => owned.has(id));
  if (!valid.length) return { ok: true, added: 0 };

  const existing = new Set(
    await fetchSegmentMemberIds(supabase, org.id, segment)
  );
  const fresh = valid.filter((id) => !existing.has(id));

  for (const part of chunk(valid, MEMBER_WRITE_CHUNK)) {
    const { error: insErr } = await supabase.from("segment_members").upsert(
      part.map((cid) => ({
        org_id: org.id,
        segment_id: segmentId,
        contact_id: cid,
      })),
      { onConflict: "segment_id,contact_id", ignoreDuplicates: true }
    );
    if (insErr) return { error: insErr.message };
  }

  await emitMembersChanged(org.id, segmentId, fresh, []);
  revalidatePath(`/segments/${segmentId}`);
  revalidatePath("/segments");
  return { ok: true, added: fresh.length };
}

/** Remove contacts from a static segment. The contacts themselves are kept. */
export async function removeContactsFromSegment(
  segmentId: string,
  contactIds: string[]
): Promise<{ ok?: boolean; error?: string; removed?: number }> {
  const { supabase, org } = await requireContext();
  if (!contactIds.length) return { ok: true, removed: 0 };

  const { segment, error } = await loadOwnedSegment(supabase, org.id, segmentId);
  if (error || !segment) return { error };
  if (segment.type === "dynamic")
    return {
      error:
        "This segment is dynamic — edit the filter instead of removing people one by one.",
    };

  let removed = 0;
  for (const part of chunk(contactIds, MEMBER_WRITE_CHUNK)) {
    const { error: delErr, count } = await supabase
      .from("segment_members")
      .delete({ count: "exact" })
      .eq("segment_id", segmentId)
      .eq("org_id", org.id)
      .in("contact_id", part);
    if (delErr) return { error: delErr.message };
    removed += count ?? 0;
  }

  await emitMembersChanged(org.id, segmentId, [], contactIds);
  revalidatePath(`/segments/${segmentId}`);
  revalidatePath("/segments");
  return { ok: true, removed };
}

export type ContactCandidate = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
};

/**
 * Contacts matching `query` that aren't already in the segment — the picker
 * behind "Add contacts" on a static segment. Capped: this is a search box, not
 * a listing, and the full book is browsable on the Contacts page.
 */
export async function searchContactsForSegment(
  segmentId: string,
  query: string
): Promise<ContactCandidate[]> {
  const { supabase, org } = await requireContext();
  const { segment, error } = await loadOwnedSegment(supabase, org.id, segmentId);
  if (error || !segment || segment.type === "dynamic") return [];

  const term = query.trim();
  let q = supabase
    .from("contacts")
    .select("id, first_name, last_name, email, companies(name)")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (term) {
    // Commas and parentheses are PostgREST `or()` syntax; wildcards are LIKE's.
    const like = `%${likeSafe(term).replace(/[,()]/g, "")}%`;
    q = q.or(
      `first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`
    );
  }
  const { data } = await q;

  const existing = new Set(
    await fetchSegmentMemberIds(supabase, org.id, segment)
  );
  return (data ?? [])
    .map((c) => {
      const row = c as unknown as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        companies: { name: string | null } | { name: string | null }[] | null;
      };
      const company = Array.isArray(row.companies)
        ? (row.companies[0]?.name ?? null)
        : (row.companies?.name ?? null);
      return {
        id: row.id,
        name:
          [row.first_name, row.last_name].filter(Boolean).join(" ") ||
          row.email ||
          "Unnamed contact",
        email: row.email,
        company,
      };
    })
    .filter((c) => !existing.has(c.id))
    .slice(0, 25);
}

/** Every non-managed static segment, for the contacts table's bulk action. */
export async function listStaticSegments(): Promise<
  { id: string; name: string }[]
> {
  const { supabase, org } = await requireContext();
  const { data } = await supabase
    .from("segments")
    .select("id, name")
    .eq("org_id", org.id)
    .eq("managed", false)
    .eq("type", "static")
    .order("name");
  return (data ?? []) as { id: string; name: string }[];
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export type SegmentExport = {
  filename: string;
  /** Header row + one row per member, ready to hand to a Blob download. */
  rows: string[][];
  error?: string;
};

const EXPORT_COLUMNS: {
  header: string;
  value: (c: EvaluableContact) => string;
}[] = [
  { header: "First name", value: (c) => c.first_name ?? "" },
  { header: "Last name", value: (c) => c.last_name ?? "" },
  { header: "Email", value: (c) => c.email ?? "" },
  { header: "Phone", value: (c) => c.phone ?? "" },
  { header: "Title", value: (c) => c.title ?? "" },
  { header: "Company", value: (c) => c.companies?.name ?? "" },
  { header: "Lifecycle stage", value: (c) => c.lifecycle_stage ?? "" },
  { header: "Source", value: (c) => c.source ?? "" },
  { header: "Lead source", value: (c) => c.lead_source ?? "" },
  { header: "City", value: (c) => c.city ?? "" },
  { header: "State / region", value: (c) => c.region ?? "" },
  { header: "Postal code", value: (c) => c.postal_code ?? "" },
  { header: "Country", value: (c) => c.country ?? "" },
  { header: "Subscribed", value: (c) => (c.unsubscribed_at ? "no" : "yes") },
  { header: "Created", value: (c) => c.created_at ?? "" },
];

/**
 * The segment's members as CSV cells. Serialization to a file happens on the
 * client (Blob + download), so this stays a plain data payload.
 */
export async function exportSegment(segmentId: string): Promise<SegmentExport> {
  const { supabase, org } = await requireContext();
  const fallback = { filename: "segment.csv", rows: [] as string[][] };

  const { segment, error } = await loadOwnedSegment(
    supabase,
    org.id,
    segmentId,
    { allowManaged: true }
  );
  if (error || !segment) return { ...fallback, error };

  try {
    const contacts = await fetchAllEvaluable(supabase, org.id);
    const byId = new Map(contacts.map((c) => [c.id, c]));
    const memberIds = await fetchSegmentMemberIds(supabase, org.id, segment);

    const rows: string[][] = [EXPORT_COLUMNS.map((c) => c.header)];
    for (const id of memberIds) {
      const c = byId.get(id);
      // A member whose contact was deleted between the two reads.
      if (!c) continue;
      rows.push(EXPORT_COLUMNS.map((col) => col.value(c)));
    }

    const slug =
      segment.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "segment";
    return { filename: `${slug}.csv`, rows };
  } catch (e) {
    return { ...fallback, error: message(e) };
  }
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

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
  if (await nameTaken(supabase, org.id, cleanName, null))
    return { error: "A segment with that name already exists." };

  // 1) Import the contacts, collecting the ids the file touched.
  const imported = await runImport("contacts", rows, opts);
  if (imported.error) return { error: imported.error, import: imported };

  const contactIds = imported.contactIds;

  // 2) Create the static segment (no filter — membership is the imported list).
  const { data: seg, error: segErr } = await supabase
    .from("segments")
    .insert({
      org_id: org.id,
      name: cleanName,
      type: "static",
      managed: false,
    })
    .select("id")
    .single();
  if (segErr) return { error: segErr.message, import: imported };
  const segmentId = seg.id as string;

  // 3) Attach members. unique(segment_id, contact_id) makes the upsert idempotent.
  for (const part of chunk(contactIds, MEMBER_WRITE_CHUNK)) {
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

  await emitMembersChanged(org.id, segmentId, contactIds, []);

  revalidatePath("/segments");
  return {
    ok: true,
    segmentId,
    memberCount: contactIds.length,
    import: imported,
  };
}
