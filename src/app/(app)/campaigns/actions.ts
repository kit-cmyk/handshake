"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/context";
import { inngest } from "@/lib/inngest/client";
import {
  evaluateFilter,
  parseDefinition,
  EVALUABLE_SELECT,
  type EvaluableContact,
} from "@/lib/segments";
import { getEmailProvider, defaultFrom } from "@/lib/email/provider";
import {
  renderTemplate,
  withUnsubscribe,
  SAMPLE_MERGE,
} from "@/lib/email/template";
import { wrapEmail } from "@/lib/email/layout";
import {
  CAMPAIGN_AUDIENCE_MODES,
  type CampaignStatus,
  type CampaignAudienceMode,
} from "@/lib/types";

export type CampaignState = { ok?: boolean; error?: string };

/** Why eligible contacts were skipped during enrollment. */
export type SkipReasons = {
  no_email: number;
  unsubscribed: number;
  suppressed: number;
  excluded: number;
  already: number;
};

/** Text content of an HTML fragment — used to tell a "<p></p>" body from real copy. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
}

type StepInput = {
  id: string | null;
  subject: string;
  body: string;
  wait_minutes: number;
  stop_on_reply: boolean | null;
};

export async function saveCampaign(
  _prev: CampaignState,
  fd: FormData
): Promise<CampaignState> {
  const { supabase, org } = await requireContext();

  const id = (fd.get("id") as string) || null;
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { error: "Campaign name is required." };

  const mailbox_id = (fd.get("mailbox_id") as string) || null;
  const exclude_segment_id = (fd.get("exclude_segment_id") as string) || null;
  const stop_on_reply = fd.get("stop_on_reply") === "1";
  const scheduledRaw = String(fd.get("scheduled_at") ?? "").trim();
  const scheduled_at = scheduledRaw ? new Date(scheduledRaw).toISOString() : null;
  const send_delay_minutes = Math.max(
    0,
    Math.trunc(Number(fd.get("send_delay_minutes")) || 0)
  );

  // Audience: "segment" uses the chosen user segment directly; "contacts" and
  // "import" reduce to a hand-picked contact list held in an auto-managed static
  // segment (resolved below) so the enrollment engine stays segment-based.
  const audienceRaw = String(fd.get("audience_mode") ?? "segment");
  const audience_mode = (
    CAMPAIGN_AUDIENCE_MODES.includes(audienceRaw as CampaignAudienceMode)
      ? audienceRaw
      : "segment"
  ) as CampaignAudienceMode;
  const providedSegmentId = (fd.get("segment_id") as string) || null;
  let contactIds: string[] = [];
  try {
    const raw = JSON.parse(String(fd.get("contact_ids") ?? "[]"));
    if (Array.isArray(raw))
      contactIds = raw.filter((x): x is string => typeof x === "string");
  } catch {
    contactIds = [];
  }

  let steps: StepInput[] = [];
  try {
    const raw = JSON.parse(String(fd.get("steps") ?? "[]"));
    if (Array.isArray(raw)) {
      steps = raw.map((s: Record<string, unknown>) => ({
        id: typeof s.id === "string" && s.id ? s.id : null,
        subject: String(s.subject ?? "").trim(),
        body: String(s.body ?? "").trim(),
        wait_minutes: Math.max(0, Number(s.wait_minutes) || 0),
        stop_on_reply:
          s.stop_on_reply === true
            ? true
            : s.stop_on_reply === false
              ? false
              : null,
      }));
    }
  } catch {
    return { error: "Invalid steps." };
  }

  // Load existing state once (edit only): the current status decides how strict
  // saving is, and the previous audience lets us reuse/clean up an auto-managed
  // static segment when the audience mode changes.
  let existingStatus: CampaignStatus = "draft";
  let prevAudienceMode: CampaignAudienceMode = "segment";
  let prevSegmentId: string | null = null;
  if (id) {
    const { data: prev } = await supabase
      .from("campaigns")
      .select("status, audience_mode, segment_id")
      .eq("id", id)
      .maybeSingle();
    if (prev) {
      existingStatus = (prev.status as CampaignStatus) ?? "draft";
      prevAudienceMode =
        (prev.audience_mode as CampaignAudienceMode) ?? "segment";
      prevSegmentId = (prev.segment_id as string | null) ?? null;
    }
  }
  const prevAutoSegmentId =
    prevAudienceMode !== "segment" ? prevSegmentId : null;

  // Drafts (including every brand-new campaign) save partially so users can come
  // back and finish later; the complete-sequence requirement is enforced at
  // enroll/run time instead (see enrollCampaign). Editing a live campaign
  // (active/paused) still requires a valid, complete sequence so we never push a
  // running send into a bad state.
  if (existingStatus !== "draft") {
    if (!steps.length) return { error: "Add at least one step." };
    const incomplete = steps.findIndex((s) => !s.subject || !stripHtml(s.body));
    if (incomplete !== -1)
      return {
        error: `Step ${incomplete + 1} needs both a subject and a body.`,
      };
  }

  // Resolve the campaign's segment_id from the chosen audience.
  let segment_id: string | null;
  if (audience_mode === "segment") {
    segment_id = providedSegmentId;
    // Switched away from a list audience → drop the orphaned auto segment.
    if (prevAutoSegmentId && prevAutoSegmentId !== providedSegmentId) {
      await supabase.from("segments").delete().eq("id", prevAutoSegmentId);
    }
  } else {
    const segmentName = `${name} · audience`;
    if (prevAutoSegmentId) {
      // Reuse the campaign's existing auto segment: rename + replace members.
      segment_id = prevAutoSegmentId;
      await supabase
        .from("segments")
        .update({ name: segmentName })
        .eq("id", prevAutoSegmentId);
      await supabase
        .from("segment_members")
        .delete()
        .eq("segment_id", prevAutoSegmentId);
    } else {
      const { data: seg, error: segErr } = await supabase
        .from("segments")
        .insert({
          org_id: org.id,
          name: segmentName,
          type: "static",
          definition: { match: "all", rules: [] },
        })
        .select("id")
        .single();
      if (segErr) return { error: segErr.message };
      segment_id = seg.id as string;
    }
    if (contactIds.length) {
      await supabase.from("segment_members").insert(
        contactIds.map((cid) => ({
          org_id: org.id,
          segment_id: segment_id as string,
          contact_id: cid,
        }))
      );
    }
  }

  const fields = {
    name,
    segment_id,
    mailbox_id,
    exclude_segment_id,
    stop_on_reply,
    scheduled_at,
    send_delay_minutes,
    audience_mode,
  };
  let campaignId = id;

  if (id) {
    const { error } = await supabase
      .from("campaigns")
      .update(fields)
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from("campaigns")
      .insert({ ...fields, org_id: org.id, status: "draft" })
      .select("id")
      .single();
    if (error) return { error: error.message };
    campaignId = data.id as string;
  }

  // Reconcile steps in place rather than delete-and-reinsert: existing rows keep
  // their id, so historical `sent`/funnel events (events.campaign_step_id) and
  // in-flight enrollments stay linked. New steps are inserted; removed ones are
  // deleted at the end.
  const { data: existingSteps } = await supabase
    .from("campaign_steps")
    .select("id")
    .eq("campaign_id", campaignId);
  const existingIds = new Set(
    (existingSteps ?? []).map((s) => (s as { id: string }).id)
  );
  const keptIds = new Set<string>();

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const row = {
      position: i,
      channel: "email",
      subject: s.subject,
      body: s.body,
      wait_minutes: s.wait_minutes,
      stop_on_reply: s.stop_on_reply,
    };
    if (s.id && existingIds.has(s.id)) {
      await supabase.from("campaign_steps").update(row).eq("id", s.id);
      keptIds.add(s.id);
    } else {
      await supabase
        .from("campaign_steps")
        .insert({ ...row, org_id: org.id, campaign_id: campaignId });
    }
  }
  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
  if (toDelete.length) {
    await supabase.from("campaign_steps").delete().in("id", toDelete);
  }

  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaignId}`);
}

async function resolveMemberIds(
  supabase: Awaited<ReturnType<typeof requireContext>>["supabase"],
  orgId: string,
  segmentId: string
): Promise<string[]> {
  const { data: segment } = await supabase
    .from("segments")
    .select("type, definition")
    .eq("id", segmentId)
    .single();
  if (!segment) return [];

  if (segment.type === "dynamic") {
    const { data: contacts } = await supabase
      .from("contacts")
      .select(EVALUABLE_SELECT)
      .eq("org_id", orgId);
    return evaluateFilter(
      (contacts ?? []) as unknown as EvaluableContact[],
      parseDefinition(segment.definition)
    ).map((c) => c.id);
  }
  const { data: members } = await supabase
    .from("segment_members")
    .select("contact_id")
    .eq("segment_id", segmentId);
  return (members ?? []).map((m) => (m as { contact_id: string }).contact_id);
}

export async function enrollCampaign(
  campaignId: string
): Promise<
  CampaignState & { enrolled?: number; skipped?: number; reasons?: SkipReasons }
> {
  const { supabase, org } = await requireContext();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (!campaign) return { error: "Campaign not found." };
  if (!campaign.segment_id)
    return { error: "Attach a segment before enrolling." };

  // Run-time gate: because drafts can be saved half-finished, enforce a complete
  // sequence here — at the moment the campaign actually starts sending.
  const { data: steps } = await supabase
    .from("campaign_steps")
    .select("subject, body")
    .eq("campaign_id", campaignId);
  if (!steps?.length)
    return { error: "Add at least one step before enrolling." };
  const incompleteStep = steps.findIndex(
    (s) =>
      !((s as { subject: string | null }).subject ?? "").trim() ||
      !stripHtml((s as { body: string | null }).body ?? "")
  );
  if (incompleteStep !== -1)
    return {
      error: `Step ${incompleteStep + 1} needs a subject and body before you can enroll. Edit the campaign to finish it.`,
    };

  const memberIds = await resolveMemberIds(supabase, org.id, campaign.segment_id);
  if (!memberIds.length) return { error: "Segment has no members." };

  // Eligibility: has email, not unsubscribed, not suppressed, not already
  // enrolled, and not in the campaign's exclusion segment.
  const [{ data: contacts }, { data: suppressed }, { data: existing }, excluded] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("id, email, unsubscribed_at")
        .eq("org_id", org.id)
        .in("id", memberIds),
      supabase.from("suppressions").select("email").eq("org_id", org.id),
      supabase
        .from("campaign_enrollments")
        .select("contact_id")
        .eq("campaign_id", campaignId),
      campaign.exclude_segment_id
        ? supabase
            .from("segment_members")
            .select("contact_id")
            .eq("segment_id", campaign.exclude_segment_id)
        : Promise.resolve({ data: [] as { contact_id: string }[] }),
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

  const reasons: SkipReasons = {
    no_email: 0,
    unsubscribed: 0,
    suppressed: 0,
    excluded: 0,
    already: 0,
  };
  const eligible = (contacts ?? []).filter((c) => {
    const row = c as { id: string; email: string | null; unsubscribed_at: string | null };
    if (!row.email) return (reasons.no_email++, false);
    if (row.unsubscribed_at) return (reasons.unsubscribed++, false);
    if (excludedIds.has(row.id)) return (reasons.excluded++, false);
    if (suppressedEmails.has(row.email.toLowerCase()))
      return (reasons.suppressed++, false);
    if (alreadyEnrolled.has(row.id)) return (reasons.already++, false);
    return true;
  }) as { id: string }[];

  const total = memberIds.length;
  if (!eligible.length)
    return { ok: true, enrolled: 0, skipped: total, reasons };

  const { data: inserted, error } = await supabase
    .from("campaign_enrollments")
    .insert(
      eligible.map((c) => ({
        org_id: org.id,
        campaign_id: campaignId,
        contact_id: c.id,
        status: "active",
        current_step: 0,
      }))
    )
    .select("id, contact_id");
  if (error) return { error: error.message };

  // Enrollment events (funnel entry point).
  await supabase.from("events").insert(
    (inserted ?? []).map((e) => ({
      org_id: org.id,
      type: "enrolled",
      campaign_id: campaignId,
      contact_id: (e as { contact_id: string }).contact_id,
    }))
  );

  // Activate + kick the durable send engine per enrollment.
  await supabase
    .from("campaigns")
    .update({ status: "active" })
    .eq("id", campaignId);

  await inngest.send(
    (inserted ?? []).map((e) => ({
      name: "campaign/enrollment.started",
      data: { enrollmentId: (e as { id: string }).id },
    }))
  );

  revalidatePath(`/campaigns/${campaignId}`);
  return {
    ok: true,
    enrolled: inserted?.length ?? 0,
    skipped: total - (inserted?.length ?? 0),
    reasons,
  };
}

export async function setCampaignStatus(
  campaignId: string,
  status: CampaignStatus
): Promise<CampaignState> {
  const { supabase } = await requireContext();
  const { error } = await supabase
    .from("campaigns")
    .update({ status })
    .eq("id", campaignId);
  if (error) return { error: error.message };

  // Resuming re-kicks active enrollments so they continue from current_step.
  if (status === "active") {
    const { data: active } = await supabase
      .from("campaign_enrollments")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("status", "active");
    if (active?.length) {
      await inngest.send(
        active.map((e) => ({
          name: "campaign/enrollment.started",
          data: { enrollmentId: (e as { id: string }).id },
        }))
      );
    }
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
  return { ok: true };
}

/**
 * End a campaign for good. Flips it to the terminal "ended" status and marks
 * every in-flight (active) enrollment "stopped", so the durable send engine —
 * which re-checks both the campaign and enrollment status before each send —
 * halts and can't silently resume later. Unlike pausing or archiving, this is
 * not reversible: to run the sequence again, duplicate the campaign.
 */
export async function endCampaign(campaignId: string): Promise<CampaignState> {
  const { supabase } = await requireContext();

  const { error } = await supabase
    .from("campaigns")
    .update({ status: "ended" })
    .eq("id", campaignId);
  if (error) return { error: error.message };

  const { error: enrErr } = await supabase
    .from("campaign_enrollments")
    .update({ status: "stopped" })
    .eq("campaign_id", campaignId)
    .eq("status", "active");
  if (enrErr) return { error: enrErr.message };

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
  return { ok: true };
}

export async function sendTestEmail(input: {
  subject: string;
  body: string;
  toEmail: string;
  mailboxId?: string | null;
}): Promise<CampaignState> {
  const { supabase, org } = await requireContext();

  const to = input.toEmail.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to))
    return { error: "Enter a valid email address to send the test to." };
  if (!input.subject.trim() || !stripHtml(input.body))
    return { error: "Add a subject and body before sending a test." };

  let from = defaultFrom();
  if (input.mailboxId) {
    const { data: mb } = await supabase
      .from("mailboxes")
      .select("email, display_name")
      .eq("id", input.mailboxId)
      .eq("org_id", org.id)
      .maybeSingle();
    if (mb)
      from = `${(mb as { display_name: string | null }).display_name ?? ""} <${
        (mb as { email: string }).email
      }>`.trim();
  }

  const subject = `[Test] ${renderTemplate(input.subject, SAMPLE_MERGE)}`;
  const html = wrapEmail(
    withUnsubscribe(renderTemplate(input.body, SAMPLE_MERGE), "#")
  );
  const res = await getEmailProvider().send({ from, to, subject, html });
  if (res.status !== "sent")
    return { error: res.error ?? "Test send failed." };
  return { ok: true };
}

export async function deleteCampaign(id: string): Promise<CampaignState> {
  const { supabase } = await requireContext();
  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/campaigns");
  return { ok: true };
}

/**
 * Delete a batch of campaigns in a single query. Called once per chunk by the
 * bulk-task runner; the client refreshes the route once at the end, so this
 * skips per-call revalidation.
 */
export async function bulkDeleteCampaigns(
  ids: string[]
): Promise<{ ok?: boolean; error?: string; deleted?: number }> {
  if (!ids.length) return { ok: true, deleted: 0 };
  const { supabase } = await requireContext();
  const { error, count } = await supabase
    .from("campaigns")
    .delete({ count: "exact" })
    .in("id", ids);
  if (error) return { error: error.message };
  return { ok: true, deleted: count ?? ids.length };
}

/**
 * Clone a campaign and its steps into a fresh draft. The copy carries over
 * config (segment, mailbox, trigger, options) but starts with no enrollments,
 * a cleared scheduled start, and a "(copy)" name so it can be safely edited
 * and launched independently.
 */
export async function duplicateCampaign(
  id: string
): Promise<CampaignState & { id?: string }> {
  const { supabase, org } = await requireContext();

  const { data: source } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();
  if (!source) return { error: "Campaign not found." };

  const { data: steps } = await supabase
    .from("campaign_steps")
    .select("*")
    .eq("campaign_id", id)
    .order("position", { ascending: true });

  // For list audiences the segment is auto-managed and owned by the source
  // campaign, so clone it (segment + members) — otherwise editing the copy's
  // audience would mutate the original's.
  let segmentId = source.segment_id as string | null;
  if (source.audience_mode && source.audience_mode !== "segment" && segmentId) {
    const { data: members } = await supabase
      .from("segment_members")
      .select("contact_id")
      .eq("segment_id", segmentId);
    const { data: clonedSeg } = await supabase
      .from("segments")
      .insert({
        org_id: org.id,
        name: `${source.name} (copy) · audience`,
        type: "static",
        definition: { match: "all", rules: [] },
      })
      .select("id")
      .single();
    segmentId = (clonedSeg?.id as string) ?? null;
    if (segmentId && members?.length) {
      await supabase.from("segment_members").insert(
        members.map((m) => ({
          org_id: org.id,
          segment_id: segmentId as string,
          contact_id: (m as { contact_id: string }).contact_id,
        }))
      );
    }
  }

  const { data: created, error } = await supabase
    .from("campaigns")
    .insert({
      org_id: org.id,
      name: `${source.name} (copy)`,
      status: "draft",
      segment_id: segmentId,
      mailbox_id: source.mailbox_id,
      stop_on_reply: source.stop_on_reply,
      exclude_segment_id: source.exclude_segment_id,
      scheduled_at: null,
      send_delay_minutes: source.send_delay_minutes ?? 0,
      audience_mode: source.audience_mode ?? "segment",
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const newId = created.id as string;
  if (steps?.length) {
    await supabase.from("campaign_steps").insert(
      steps.map((s, i) => ({
        org_id: org.id,
        campaign_id: newId,
        position: i,
        channel: (s as { channel: string }).channel ?? "email",
        subject: (s as { subject: string | null }).subject,
        body: (s as { body: string | null }).body,
        wait_minutes: (s as { wait_minutes: number }).wait_minutes,
        stop_on_reply: (s as { stop_on_reply: boolean | null }).stop_on_reply,
      }))
    );
  }

  revalidatePath("/campaigns");
  return { ok: true, id: newId };
}
