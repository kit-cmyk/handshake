import type { SupabaseClient } from "@supabase/supabase-js";

// Shared campaign-enrollment logic used by every event-driven trigger
// (segment entry, lifecycle change, activity logged). Runs against the
// service-role client inside Inngest. Applies the same eligibility rules as the
// manual enrollCampaign action: the campaign must have steps, and each contact
// must have an email, not be unsubscribed/suppressed, not already be enrolled,
// not be in the exclusion segment, and (when restrictToSegmentId is given) be a
// current member of that segment. Returns the new enrollment ids.

export type EnrollOptions = {
  orgId: string;
  campaignId: string;
  contactIds: string[];
  excludeSegmentId?: string | null;
  /** When set, only enroll contacts who are members of this segment. */
  restrictToSegmentId?: string | null;
};

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

  const [
    { data: contacts },
    { data: suppressed },
    { data: existing },
    excluded,
    restricted,
  ] = await Promise.all([
    admin
      .from("contacts")
      .select("id, email, unsubscribed_at")
      .eq("org_id", orgId)
      .in("id", contactIds),
    admin.from("suppressions").select("email").eq("org_id", orgId),
    admin
      .from("campaign_enrollments")
      .select("contact_id")
      .eq("campaign_id", campaignId),
    opts.excludeSegmentId
      ? admin
          .from("segment_members")
          .select("contact_id")
          .eq("segment_id", opts.excludeSegmentId)
      : Promise.resolve({ data: [] as { contact_id: string }[] }),
    opts.restrictToSegmentId
      ? admin
          .from("segment_members")
          .select("contact_id")
          .eq("segment_id", opts.restrictToSegmentId)
      : Promise.resolve({ data: null }),
  ]);

  const suppressedEmails = new Set(
    (suppressed ?? []).map((s) => (s as { email: string }).email.toLowerCase())
  );
  const alreadyEnrolled = new Set(
    (existing ?? []).map((e) => (e as { contact_id: string }).contact_id)
  );
  const excludedIds = new Set(
    (excluded.data ?? []).map((e) => (e as { contact_id: string }).contact_id)
  );
  const restrictIds =
    restricted.data === null
      ? null
      : new Set(
          (restricted.data ?? []).map(
            (e) => (e as { contact_id: string }).contact_id
          )
        );

  const eligible = (contacts ?? []).filter((row) => {
    const r = row as {
      id: string;
      email: string | null;
      unsubscribed_at: string | null;
    };
    if (!r.email) return false;
    if (r.unsubscribed_at) return false;
    if (suppressedEmails.has(r.email.toLowerCase())) return false;
    if (alreadyEnrolled.has(r.id)) return false;
    if (excludedIds.has(r.id)) return false;
    if (restrictIds && !restrictIds.has(r.id)) return false;
    return true;
  }) as { id: string }[];
  if (!eligible.length) return [];

  const { data: inserted } = await admin
    .from("campaign_enrollments")
    .insert(
      eligible.map((row) => ({
        org_id: orgId,
        campaign_id: campaignId,
        contact_id: row.id,
        status: "active",
        current_step: 0,
      }))
    )
    .select("id, contact_id");

  await admin.from("events").insert(
    (inserted ?? []).map((e) => ({
      org_id: orgId,
      type: "enrolled",
      campaign_id: campaignId,
      contact_id: (e as { contact_id: string }).contact_id,
    }))
  );

  return (inserted ?? []).map((e) => (e as { id: string }).id);
}
