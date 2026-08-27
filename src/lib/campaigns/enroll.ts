import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/paginate";
import {
  chunk,
  fetchSegmentMemberIds,
  EMPTY_DEFINITION,
  MEMBER_WRITE_CHUNK,
} from "@/lib/segments";

// Shared campaign-enrollment logic used by every event-driven trigger
// (segment entry, lifecycle change, activity logged). Runs against the
// service-role client inside Inngest. Applies the same eligibility rules as the
// manual enrollCampaign action: the campaign must have steps, and each contact
// must have an email, not be unsubscribed/suppressed, not already be enrolled,
// not be in the exclusion segment, and (when restrictToSegmentId is given) be a
// current member of that segment. Returns the new enrollment ids.
//
// Every lookup below has to see *all* its rows: a suppression list, enrollment
// list or segment membership truncated at PostgREST's 1000-row cap turns into
// a mail-out to people who opted out, or a silent skip of people who qualify.

export type EnrollOptions = {
  orgId: string;
  campaignId: string;
  contactIds: string[];
  excludeSegmentId?: string | null;
  /** When set, only enroll contacts who are members of this segment. */
  restrictToSegmentId?: string | null;
};

/**
 * The cached membership rows of a segment, paged. Both the exclusion and the
 * restriction check read `segment_members` regardless of the segment's type —
 * the cron keeps a dynamic segment's cache current.
 */
function cachedMemberIds(
  admin: SupabaseClient,
  orgId: string,
  segmentId: string
): Promise<string[]> {
  return fetchSegmentMemberIds(admin, orgId, {
    id: segmentId,
    type: "static",
    definition: EMPTY_DEFINITION,
  });
}

export async function enrollContacts(
  admin: SupabaseClient,
  opts: EnrollOptions
): Promise<string[]> {
  const { orgId, campaignId, contactIds } = opts;
  if (!contactIds.length) return [];

  const { count: stepCount } = await admin
    .from("campaign_steps")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  if (!stepCount) return [];

  type ContactRow = {
    id: string;
    email: string | null;
    unsubscribed_at: string | null;
  };

  const [contacts, suppressed, existing, excludedIdList, restrictIdList] =
    await Promise.all([
      // `.in()` on a very long id list is both a URL-length and a row-cap
      // hazard, so read the candidates in batches.
      (async () => {
        const rows: ContactRow[] = [];
        for (const part of chunk(contactIds, MEMBER_WRITE_CHUNK)) {
          const { data } = await admin
            .from("contacts")
            .select("id, email, unsubscribed_at")
            .eq("org_id", orgId)
            .in("id", part);
          rows.push(...((data ?? []) as ContactRow[]));
        }
        return rows;
      })(),
      fetchAllRows<{ email: string }>((from, to) =>
        admin
          .from("suppressions")
          .select("email, id")
          .eq("org_id", orgId)
          .order("id")
          .range(from, to)
      ),
      fetchAllRows<{ contact_id: string }>((from, to) =>
        admin
          .from("campaign_enrollments")
          .select("contact_id, id")
          .eq("campaign_id", campaignId)
          .order("id")
          .range(from, to)
      ),
      opts.excludeSegmentId
        ? cachedMemberIds(admin, orgId, opts.excludeSegmentId)
        : Promise.resolve([] as string[]),
      opts.restrictToSegmentId
        ? cachedMemberIds(admin, orgId, opts.restrictToSegmentId)
        : Promise.resolve(null),
    ]);

  const suppressedEmails = new Set(
    suppressed.map((s) => s.email.toLowerCase())
  );
  const alreadyEnrolled = new Set(existing.map((e) => e.contact_id));
  const excludedIds = new Set(excludedIdList);
  const restrictIds = restrictIdList === null ? null : new Set(restrictIdList);

  const eligible = contacts.filter((r) => {
    if (!r.email) return false;
    if (r.unsubscribed_at) return false;
    if (suppressedEmails.has(r.email.toLowerCase())) return false;
    if (alreadyEnrolled.has(r.id)) return false;
    if (excludedIds.has(r.id)) return false;
    if (restrictIds && !restrictIds.has(r.id)) return false;
    return true;
  });
  if (!eligible.length) return [];

  // Upsert-ignore: if a concurrent trigger enrolled one of these contacts
  // between the eligibility read above and now, that row is skipped rather than
  // failing the whole batch on the unique(campaign_id, contact_id) constraint.
  const enrollmentIds: string[] = [];
  for (const part of chunk(eligible, MEMBER_WRITE_CHUNK)) {
    const { data: inserted } = await admin
      .from("campaign_enrollments")
      .upsert(
        part.map((row) => ({
          org_id: orgId,
          campaign_id: campaignId,
          contact_id: row.id,
          status: "active",
          current_step: 0,
        })),
        { onConflict: "campaign_id,contact_id", ignoreDuplicates: true }
      )
      .select("id, contact_id");

    if (inserted?.length) {
      await admin.from("events").insert(
        inserted.map((e) => ({
          org_id: orgId,
          type: "enrolled",
          campaign_id: campaignId,
          contact_id: (e as { contact_id: string }).contact_id,
        }))
      );
      enrollmentIds.push(...inserted.map((e) => (e as { id: string }).id));
    }
  }

  return enrollmentIds;
}
