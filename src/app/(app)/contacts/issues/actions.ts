"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";

export type MergeState = { ok?: boolean; error?: string };
export type FixState = { ok?: boolean; error?: string };

/** Fields the inline fixer on the issues page is allowed to write. */
const FIXABLE_FIELDS = ["first_name", "last_name", "email", "phone"] as const;
type FixableField = (typeof FIXABLE_FIELDS)[number];

/**
 * Inline resolve a formatting/completeness issue: patch only the flagged
 * fields on a single contact. Empty strings clear to null so a bad value can
 * be wiped as well as corrected.
 */
export async function resolveContactFields(
  id: string,
  patch: Partial<Record<FixableField, string>>
): Promise<FixState> {
  const { supabase } = await requireContext();

  const update: Record<string, string | null> = {};
  for (const f of FIXABLE_FIELDS) {
    if (f in patch) {
      const v = (patch[f] ?? "").trim();
      update[f] = v === "" ? null : v;
    }
  }
  if (!Object.keys(update).length) return { error: "Nothing to update." };

  const { error } = await supabase.from("contacts").update(update).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/contacts/issues");
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
  return { ok: true };
}

/**
 * Skip a data-quality issue the user can't or won't fix (e.g. a contact with
 * no phone). The reason keys are appended to the contact's dismissed_issues so
 * the detector stops flagging them. Idempotent — re-skipping is a no-op.
 */
export async function skipContactIssues(
  id: string,
  reasons: string[]
): Promise<FixState> {
  const { supabase } = await requireContext();
  const add = [...new Set(reasons)].filter(Boolean);
  if (!add.length) return { error: "Nothing to skip." };

  const { data: contact } = await supabase
    .from("contacts")
    .select("dismissed_issues")
    .eq("id", id)
    .single();
  if (!contact) return { error: "Contact not found." };

  const merged = [
    ...new Set([...((contact.dismissed_issues as string[]) ?? []), ...add]),
  ];
  const { error } = await supabase
    .from("contacts")
    .update({ dismissed_issues: merged })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/contacts/issues");
  return { ok: true };
}

/**
 * Bulk-dismiss issue reasons across many contacts at once — e.g. "skip Missing
 * phone for everyone" when phone is optional for this book. Appends the reasons
 * to each contact's dismissed_issues so the detector stops flagging them.
 * Idempotent; contacts already dismissing all the reasons are left alone.
 */
export async function skipContactIssuesBulk(
  ids: string[],
  reasons: string[]
): Promise<FixState> {
  const { supabase } = await requireContext();
  const targetIds = [...new Set(ids)].filter(Boolean);
  const add = [...new Set(reasons)].filter(Boolean);
  if (!targetIds.length || !add.length) return { error: "Nothing to skip." };

  const chunk = <T,>(a: T[], n: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
    return out;
  };

  for (const part of chunk(targetIds, 300)) {
    const { data: rows, error: selErr } = await supabase
      .from("contacts")
      .select("id, dismissed_issues")
      .in("id", part);
    if (selErr) return { error: selErr.message };

    // Rows with no prior dismissals share one target array, so update them in a
    // single statement; only rows with existing dismissals need per-row merges.
    const freshIds: string[] = [];
    const perRow: { id: string; merged: string[] }[] = [];
    for (const r of rows ?? []) {
      const existing = ((r.dismissed_issues as string[] | null) ?? []);
      const merged = [...new Set([...existing, ...add])];
      if (merged.length === existing.length) continue; // already dismissed
      if (existing.length === 0) freshIds.push(r.id as string);
      else perRow.push({ id: r.id as string, merged });
    }

    if (freshIds.length) {
      const { error } = await supabase
        .from("contacts")
        .update({ dismissed_issues: add })
        .in("id", freshIds);
      if (error) return { error: error.message };
    }
    for (const p of perRow) {
      const { error } = await supabase
        .from("contacts")
        .update({ dismissed_issues: p.merged })
        .eq("id", p.id);
      if (error) return { error: error.message };
    }
  }

  revalidatePath("/contacts/issues");
  revalidatePath("/contacts");
  return { ok: true };
}

/**
 * Delete one or more contact records outright — for junk rows on the issues
 * page that aren't worth fixing. Related activities/deals detach or cascade
 * per the schema's FK rules.
 */
export async function deleteContacts(ids: string[]): Promise<FixState> {
  const { supabase } = await requireContext();
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return { error: "No contacts selected." };

  // Remove deals linked only to these contacts first, else the SET-NULL on
  // delete would violate deals_contact_or_company_chk and abort the whole batch.
  await supabase
    .from("deals")
    .delete()
    .in("contact_id", unique)
    .is("company_id", null);
  const { error } = await supabase.from("contacts").delete().in("id", unique);
  if (error) return { error: error.message };

  revalidatePath("/contacts/issues");
  revalidatePath("/contacts");
  return { ok: true };
}

const BACKFILL_FIELDS = [
  "email",
  "phone",
  "title",
  "first_name",
  "last_name",
  "company_id",
] as const;

type Supabase = Awaited<ReturnType<typeof requireContext>>["supabase"];

/**
 * Core merge for one group (no revalidation — callers do that). Backfills the
 * primary's empty fields from the duplicates, then hands off to the
 * `merge_contacts` RPC, which transactionally reassigns ALL related records
 * (activities, deals, events, messages, conversations, campaign enrollments,
 * workflow runs, segment memberships) to the primary before deleting the
 * duplicates — so a merge no longer silently destroys inbox threads, enrollment
 * history, or segment membership. Returns an error string or null.
 */
async function mergeOne(
  supabase: Supabase,
  primaryId: string,
  dupeIds: string[]
): Promise<string | null> {
  const ids = [...new Set(dupeIds)].filter((id) => id && id !== primaryId);
  if (!ids.length) return "Pick at least one duplicate to merge in.";

  const { data: primary } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", primaryId)
    .single();
  if (!primary) return "Primary contact not found.";

  const { data: dupes } = await supabase
    .from("contacts")
    .select("*")
    .in("id", ids);

  // Backfill empty primary fields from the first duplicate that has a value.
  const patch: Record<string, unknown> = {};
  for (const f of BACKFILL_FIELDS) {
    if (primary[f] == null) {
      const donor = (dupes ?? []).find((d) => d[f] != null);
      if (donor) patch[f] = donor[f];
    }
  }
  if (Object.keys(patch).length) {
    await supabase.from("contacts").update(patch).eq("id", primaryId);
  }

  // Transactionally reassign every related record, then delete the duplicates.
  const { error } = await supabase.rpc("merge_contacts", {
    p_primary: primaryId,
    p_dupes: ids,
  });
  return error ? error.message : null;
}

/**
 * Merge duplicate contacts into a primary: backfill the primary's empty fields
 * from the duplicates, reassign their activities + deals, then delete them.
 */
export async function mergeContacts(
  primaryId: string,
  dupeIds: string[]
): Promise<MergeState> {
  const { supabase } = await requireContext();
  const err = await mergeOne(supabase, primaryId, dupeIds);
  if (err) return { error: err };

  revalidatePath("/contacts/issues");
  revalidatePath("/contacts");
  return { ok: true };
}

/**
 * Merge several duplicate groups in one pass — for the "merge selected groups"
 * bulk action. Each plan is a { primaryId, dupeIds } pair. Stops at the first
 * failure and reports how many groups merged cleanly.
 */
export async function bulkMergeContacts(
  plans: { primaryId: string; dupeIds: string[] }[]
): Promise<MergeState & { merged?: number }> {
  const { supabase } = await requireContext();
  if (!plans.length) return { error: "No groups selected." };

  let merged = 0;
  for (const plan of plans) {
    const err = await mergeOne(supabase, plan.primaryId, plan.dupeIds);
    if (err) {
      revalidatePath("/contacts/issues");
      revalidatePath("/contacts");
      return { error: `Merged ${merged}, then failed: ${err}`, merged };
    }
    merged++;
  }

  revalidatePath("/contacts/issues");
  revalidatePath("/contacts");
  return { ok: true, merged };
}
