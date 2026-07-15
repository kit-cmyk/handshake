import { inngest } from "./client";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/paginate";
import {
  evaluateFilter,
  matchesDefinition,
  parseDefinition,
  EVALUABLE_SELECT,
  type EvaluableContact,
} from "@/lib/segments";
import { getEmailProvider, defaultFrom } from "@/lib/email/provider";
import { renderTemplate, withUnsubscribe } from "@/lib/email/template";
import { wrapEmail } from "@/lib/email/layout";
import {
  withOpenPixel,
  withClickTracking,
  replyAddress,
  type TrackContext,
} from "@/lib/email/tracking";
import { unsubUrl, unsubHeaders } from "@/lib/unsubscribe";
import { notifyCampaignFinished } from "@/lib/integrations/notify";
import { enrollContacts } from "@/lib/campaigns/enroll";
import {
  parseGraph,
  parseExitConfig,
  hasExitCriteria,
  getNode,
  findTriggerNode,
  nextNodeId,
  evaluateBranch,
} from "@/lib/workflows";
import { LIFECYCLE_STAGES, type LifecycleStage } from "@/lib/types";
import {
  nextSendTime,
  localDayStartUtc,
  ALWAYS_ON,
  type SendWindow,
} from "@/lib/schedule";

/** Read an org's configured send window (falls back to always-on). */
async function loadSendWindow(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string
): Promise<SendWindow> {
  const { data } = await admin
    .from("organizations")
    .select("send_timezone, send_window_start, send_window_end, send_days")
    .eq("id", orgId)
    .maybeSingle();
  if (!data) return ALWAYS_ON;
  return {
    timezone: (data.send_timezone as string) ?? "UTC",
    startHour: (data.send_window_start as number) ?? 0,
    endHour: (data.send_window_end as number) ?? 24,
    days: (data.send_days as number[]) ?? ALWAYS_ON.days,
  };
}

/**
 * Smoke-test function proving the durable job engine is wired end-to-end.
 * Trigger by sending the "test/hello" event.
 */
export const helloWorld = inngest.createFunction(
  { id: "hello-world", triggers: [{ event: "test/hello" }] },
  async ({ event, step }) => {
    await step.sleep("wait-a-moment", "1s");
    return { message: `Hello ${event.data?.name ?? "world"}!` };
  }
);

/**
 * Hourly re-evaluation of every dynamic segment across all orgs. Recomputes
 * membership, refreshes the cached segment_members rows, stamps
 * last_evaluated_at, and emits `segment/members.changed` with the added/removed
 * contacts — the auto-enroll hook that campaigns (E5) and workflows (E6) consume.
 */
export const reevaluateSegments = inngest.createFunction(
  { id: "reevaluate-segments", triggers: [{ cron: "0 * * * *" }] },
  async ({ step }) => {
    const admin = createAdminClient();

    const { data: segments } = await admin
      .from("segments")
      .select("id, org_id, definition")
      .eq("type", "dynamic");

    let processed = 0;
    for (const seg of segments ?? []) {
      const change = await step.run(`reevaluate-${seg.id}`, async () => {
        // Page past the PostgREST row cap so membership isn't truncated.
        const contacts = await fetchAllRows<EvaluableContact>((from, to) =>
          admin
            .from("contacts")
            .select(EVALUABLE_SELECT)
            .eq("org_id", seg.org_id)
            .range(from, to)
        );

        const matched = evaluateFilter(
          contacts,
          parseDefinition(seg.definition)
        );
        const matchedIds = new Set(matched.map((c) => c.id));

        const { data: existing } = await admin
          .from("segment_members")
          .select("contact_id")
          .eq("segment_id", seg.id);
        const existingIds = new Set(
          (existing ?? []).map((r) => (r as { contact_id: string }).contact_id)
        );

        const added = [...matchedIds].filter((id) => !existingIds.has(id));
        const removed = [...existingIds].filter((id) => !matchedIds.has(id));

        // Replace the cached membership.
        await admin.from("segment_members").delete().eq("segment_id", seg.id);
        if (matched.length) {
          await admin.from("segment_members").insert(
            matched.map((c) => ({
              org_id: seg.org_id,
              segment_id: seg.id,
              contact_id: c.id,
            }))
          );
        }
        await admin
          .from("segments")
          .update({ last_evaluated_at: new Date().toISOString() })
          .eq("id", seg.id);

        return { added, removed };
      });

      if (change.added.length || change.removed.length) {
        await step.sendEvent(`notify-${seg.id}`, {
          name: "segment/members.changed",
          data: {
            segmentId: seg.id,
            orgId: seg.org_id,
            added: change.added,
            removed: change.removed,
          },
        });
      }
      processed++;
    }

    return { processed };
  }
);

/**
 * Durable campaign send engine. One run per enrollment: walks the sequence,
 * honoring per-step delays, re-checking enrollment + campaign status and
 * suppressions before each send, writing a `sent` event (funnel source), and
 * advancing current_step so a paused/resumed campaign continues where it left off.
 */
type LoadedContact = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  title: string | null;
  lifecycle_stage: string | null;
  companies: { name: string | null } | null;
};

export const campaignEngine = inngest.createFunction(
  {
    id: "campaign-enrollment",
    triggers: [{ event: "campaign/enrollment.started" }],
    concurrency: { limit: 20 },
    // One live run per enrollment. Pausing a campaign leaves its run sleeping in
    // a wait/cap step; resuming re-emits `enrollment.started` for every active
    // enrollment. Without this, the resume spawns a *second* run alongside the
    // still-sleeping original and the contact receives every remaining step
    // twice. "skip" drops the duplicate while a run is still in progress; if the
    // original already woke and stopped, no run is active so the re-emit starts a
    // fresh one from current_step. Also guards double resume-clicks.
    singleton: { key: "event.data.enrollmentId", mode: "skip" },
    // If a step exhausts its retries, flip the enrollment to a terminal state so
    // it stops rather than sitting 'active' with current_step frozen forever.
    onFailure: async ({ event }) => {
      const enrollmentId = event.data.event.data?.enrollmentId as
        | string
        | undefined;
      if (!enrollmentId) return;
      const admin = createAdminClient();
      await admin
        .from("campaign_enrollments")
        .update({ status: "failed" })
        .eq("id", enrollmentId)
        .eq("status", "active");
    },
  },
  async ({ event, step }) => {
    const admin = createAdminClient();
    const enrollmentId = event.data.enrollmentId as string;

    const ctx = await step.run("load", async () => {
      const { data: enr } = await admin
        .from("campaign_enrollments")
        .select("*")
        .eq("id", enrollmentId)
        .single();
      if (!enr) return null;
      const { data: steps } = await admin
        .from("campaign_steps")
        .select("*")
        .eq("campaign_id", enr.campaign_id)
        .order("position", { ascending: true });
      const { data: contact } = await admin
        .from("contacts")
        .select(
          "id, email, first_name, last_name, phone, title, lifecycle_stage, companies(name)"
        )
        .eq("id", enr.contact_id)
        .single();
      let mailbox: {
        id: string;
        email: string;
        display_name: string | null;
        daily_limit: number;
      } | null = null;
      const { data: campaign } = await admin
        .from("campaigns")
        .select("mailbox_id, scheduled_at, send_delay_minutes")
        .eq("id", enr.campaign_id)
        .single();
      if (campaign?.mailbox_id) {
        const { data } = await admin
          .from("mailboxes")
          .select("id, email, display_name, daily_limit")
          .eq("id", campaign.mailbox_id)
          .single();
        mailbox = data;
      }
      const sendWindow = await loadSendWindow(admin, enr.org_id as string);
      return {
        orgId: enr.org_id as string,
        campaignId: enr.campaign_id as string,
        scheduledAt: (campaign?.scheduled_at as string | null) ?? null,
        sendDelayMinutes: (campaign?.send_delay_minutes as number | null) ?? 0,
        startIndex: (enr.current_step as number) ?? 0,
        steps: (steps ?? []) as {
          id: string;
          position: number;
          subject: string | null;
          body: string | null;
          wait_minutes: number;
        }[],
        contact: contact as LoadedContact | null,
        mailbox,
        sendWindow,
      };
    });

    if (!ctx || !ctx.contact) return { skipped: true };

    const merge = {
      first_name: ctx.contact.first_name,
      last_name: ctx.contact.last_name,
      email: ctx.contact.email,
      phone: ctx.contact.phone,
      title: ctx.contact.title,
      lifecycle_stage: ctx.contact.lifecycle_stage,
      company: ctx.contact.companies?.name ?? "",
    };
    const from = ctx.mailbox
      ? `${ctx.mailbox.display_name ?? ""} <${ctx.mailbox.email}>`.trim()
      : defaultFrom();

    // Deferred start: hold the very first send until the scheduled calendar
    // time, or — for the "At delay" send mode — until send_delay_minutes after
    // enrollment. The two are mutually exclusive (the builder sets one or none).
    if (ctx.startIndex === 0) {
      if (ctx.scheduledAt) {
        const when = new Date(ctx.scheduledAt);
        if (when.getTime() > Date.now()) {
          await step.sleepUntil("scheduled-start", when);
        }
      } else if (ctx.sendDelayMinutes > 0) {
        await step.sleep("send-delay", `${ctx.sendDelayMinutes}m`);
      }
    }

    for (let i = ctx.startIndex; i < ctx.steps.length; i++) {
      const s = ctx.steps[i];
      if (s.wait_minutes > 0) {
        await step.sleep(`wait-${i}`, `${s.wait_minutes}m`);
      }

      // Best-effort daily send cap per mailbox: if today's sends have hit the
      // mailbox limit, defer this send until the next UTC day (when the count
      // resets). Re-check after each wait — a batch that all deferred to the same
      // day boundary would otherwise wake together and send in one burst, blowing
      // past the cap; re-checking rolls the overflow to the following day.
      // Bounded so a persistently-over-cap mailbox can't wait forever.
      if (ctx.mailbox && ctx.mailbox.daily_limit > 0) {
        for (let attempt = 0; attempt < 7; attempt++) {
          const waitMinutes = await step.run(
            `cap-check-${i}-${attempt}`,
            async () => {
              const now = new Date();
              // Reset the daily count at the org's local midnight, not UTC.
              const startOfDay = localDayStartUtc(now, ctx.sendWindow.timezone);
              const { count } = await admin
                .from("events")
                .select("id", { count: "exact", head: true })
                .eq("org_id", ctx.orgId)
                .eq("type", "sent")
                .filter("metadata->>mailbox_id", "eq", ctx.mailbox!.id)
                .gte("occurred_at", startOfDay.toISOString());
              if ((count ?? 0) < ctx.mailbox!.daily_limit) return 0;
              const nextDay = new Date(
                startOfDay.getTime() + 24 * 60 * 60 * 1000
              );
              return Math.ceil((nextDay.getTime() - now.getTime()) / 60000);
            }
          );
          if (waitMinutes <= 0) break;
          await step.sleep(`cap-wait-${i}-${attempt}`, `${waitMinutes}m`);
        }
      }

      // Respect the org's send window (timezone + quiet hours / weekdays): if
      // now falls outside it, sleep until the next open slot before sending.
      const windowWaitUntil = await step.run(`window-check-${i}`, async () => {
        const target = nextSendTime(new Date(), ctx.sendWindow);
        return target.getTime() > Date.now() ? target.toISOString() : null;
      });
      if (windowWaitUntil) {
        await step.sleepUntil(`window-wait-${i}`, new Date(windowWaitUntil));
      }

      // Pre-send gate: re-check enrollment/campaign status + suppressions after
      // any delay. Read-only (plus the unsubscribe short-circuit), so retrying
      // it is safe and never sends.
      const gate = await step.run(`gate-${i}`, async () => {
        const { data: enr } = await admin
          .from("campaign_enrollments")
          .select("status")
          .eq("id", enrollmentId)
          .single();
        if (!enr || enr.status !== "active") return { stop: true };

        const { data: campaign } = await admin
          .from("campaigns")
          .select("status")
          .eq("id", ctx.campaignId)
          .single();
        if (!campaign || campaign.status !== "active") return { stop: true };

        const email = ctx.contact!.email;
        if (!email) return { stop: true };

        const { data: supp } = await admin
          .from("suppressions")
          .select("id")
          .eq("org_id", ctx.orgId)
          .eq("email", email)
          .maybeSingle();
        if (supp) {
          await admin
            .from("campaign_enrollments")
            .update({ status: "unsubscribed" })
            .eq("id", enrollmentId);
          return { stop: true };
        }
        return { stop: false };
      });

      if (gate.stop) return { stopped: true, at: i };

      // Isolate the non-idempotent provider send in its own step. Inngest
      // memoizes a step's result once it succeeds, so a failure in the
      // bookkeeping steps below only retries *those* — it can never re-send this
      // email. (A throw inside this step itself still retries the send, but the
      // ordinary transient-DB-error case that drove duplicate sends is gone.)
      const res = await step.run(`send-${i}`, async () => {
        const email = ctx.contact!.email!;
        const track: TrackContext = {
          orgId: ctx.orgId,
          contactId: ctx.contact!.id,
          campaignId: ctx.campaignId,
          stepId: s.id,
        };
        const subject = renderTemplate(s.subject ?? "", merge);
        // Body links get click-tracked first, then the unsubscribe footer is
        // appended (untracked), then the open pixel is added last — finally the
        // whole fragment is wrapped in the shared client-safe email shell.
        const html = wrapEmail(
          withOpenPixel(
            withUnsubscribe(
              withClickTracking(renderTemplate(s.body ?? "", merge), track),
              unsubUrl(ctx.contact!.id, ctx.campaignId)
            ),
            track
          )
        );
        return getEmailProvider().send({
          from,
          to: email,
          subject,
          html,
          replyTo: replyAddress(track, enrollmentId),
          headers: unsubHeaders(ctx.contact!.id, ctx.campaignId),
        });
      });

      await step.run(`record-${i}`, async () => {
        await admin.from("events").insert({
          org_id: ctx.orgId,
          type: res.status === "sent" ? "sent" : "failed",
          campaign_id: ctx.campaignId,
          campaign_step_id: s.id,
          contact_id: ctx.contact!.id,
          metadata: {
            message_id: res.id,
            error: res.error ?? null,
            mailbox_id: ctx.mailbox?.id ?? null,
          },
        });
      });

      await step.run(`advance-${i}`, async () => {
        await admin
          .from("campaign_enrollments")
          .update({ current_step: i + 1 })
          .eq("id", enrollmentId);
      });
    }

    await step.run("complete", async () => {
      await admin
        .from("campaign_enrollments")
        .update({ status: "completed" })
        .eq("id", enrollmentId);
      await admin.from("events").insert({
        org_id: ctx.orgId,
        type: "completed",
        campaign_id: ctx.campaignId,
        contact_id: ctx.contact!.id,
      });
      await notifyCampaignFinished(
        admin,
        ctx.orgId,
        ctx.contact!.id,
        ctx.campaignId,
      );
    });

    return { completed: true };
  }
);

/**
 * Durable workflow execution engine. One run per enrolled contact: walks the
 * node graph from the trigger, executing each action (send email / wait /
 * set lifecycle / add to segment / branch), recording workflow_run_steps and
 * events, re-checking run + workflow status before each node, and persisting
 * current_node so pause/resume continues where it left off.
 */
export const workflowRun = inngest.createFunction(
  {
    id: "workflow-run",
    triggers: [{ event: "workflow/run.started" }],
    concurrency: { limit: 20 },
    // One live run per workflow_run row — a resumed/re-triggered run must not
    // execute alongside a still-sleeping original (same double-send hazard as
    // the campaign engine).
    singleton: { key: "event.data.runId", mode: "skip" },
    // Terminal-fail a run whose step ran out of retries so it doesn't sit
    // 'active' with current_node frozen forever.
    onFailure: async ({ event }) => {
      const runId = event.data.event.data?.runId as string | undefined;
      if (!runId) return;
      const admin = createAdminClient();
      await admin
        .from("workflow_runs")
        .update({ status: "failed", ended_at: new Date().toISOString() })
        .eq("id", runId)
        .eq("status", "active");
    },
  },
  async ({ event, step }) => {
    const admin = createAdminClient();
    const runId = event.data.runId as string;

    const ctx = await step.run("load", async () => {
      const { data: run } = await admin
        .from("workflow_runs")
        .select("*")
        .eq("id", runId)
        .single();
      if (!run) return null;
      const { data: wf } = await admin
        .from("workflows")
        .select("*")
        .eq("id", run.workflow_id)
        .single();
      const { data: contact } = await admin
        .from("contacts")
        .select(EVALUABLE_SELECT)
        .eq("id", run.contact_id)
        .single();
      const sendWindow = await loadSendWindow(admin, run.org_id as string);
      return { run, wf, contact, sendWindow };
    });

    if (!ctx || !ctx.run || !ctx.wf || !ctx.contact) return { skipped: true };

    const contact = ctx.contact as unknown as EvaluableContact;
    const orgId = ctx.run.org_id as string;
    const workflowId = ctx.run.workflow_id as string;
    const graph = parseGraph(ctx.wf.graph);
    const trigger = findTriggerNode(graph);
    let current: string | null =
      (ctx.run.current_node as string | null) ??
      (trigger ? nextNodeId(graph, trigger.id) : null);

    const merge = {
      first_name: contact.first_name,
      last_name: contact.last_name,
      email: contact.email,
      company: contact.companies?.name ?? "",
    };
    let guard = 0;
    while (current && guard < 100) {
      guard++;
      const node = getNode(graph, current);
      if (!node) break;

      if (node.data.action === "wait") {
        const cfg = node.data.config ?? {};
        if (cfg.mode === "until_time" && typeof cfg.time === "string") {
          // Sleep until the next UTC occurrence of HH:MM.
          const [h, m] = cfg.time.split(":").map(Number);
          if (Number.isFinite(h) && Number.isFinite(m)) {
            const now = new Date();
            const target = new Date(now);
            target.setUTCHours(h, m, 0, 0);
            if (target.getTime() <= now.getTime())
              target.setUTCDate(target.getUTCDate() + 1);
            await step.sleepUntil(`wait-${node.id}`, target);
          }
        } else {
          const minutes = Number(cfg.minutes) || 0;
          if (minutes > 0) await step.sleep(`wait-${node.id}`, `${minutes}m`);
        }
      }

      const outcome = await step.run(`node-${node.id}`, async () => {
        const { data: run } = await admin
          .from("workflow_runs")
          .select("status")
          .eq("id", runId)
          .single();
        if (!run || run.status !== "active") return { stop: true, next: null };
        const { data: wf } = await admin
          .from("workflows")
          .select("status, mailbox_id, exit_config")
          .eq("id", workflowId)
          .single();
        if (!wf || wf.status !== "running") return { stop: true, next: null };

        // Early-exit criteria: reply, goal stage, segment membership, or a
        // field condition — whichever fires first stops the run.
        const exit = parseExitConfig(wf.exit_config);
        if (hasExitCriteria(exit)) {
          let exitReason: string | null = null;

          // Fields-based checks (goal stage / condition rules) run against a
          // fresh read so stage/attribute changes mid-run are respected.
          if (exit.goalStage || (exit.rules && exit.rules.length)) {
            const { data: fresh } = await admin
              .from("contacts")
              .select(EVALUABLE_SELECT)
              .eq("id", contact.id)
              .single();
            const c = fresh as unknown as EvaluableContact | null;
            if (c) {
              if (exit.goalStage && c.lifecycle_stage === exit.goalStage)
                exitReason = "goal";
              if (
                !exitReason &&
                exit.rules &&
                exit.rules.length &&
                matchesDefinition(c, {
                  match: exit.match ?? "all",
                  rules: exit.rules,
                })
              )
                exitReason = "condition";
            }
          }

          if (!exitReason && exit.segmentId) {
            const { data: member } = await admin
              .from("segment_members")
              .select("contact_id")
              .eq("segment_id", exit.segmentId)
              .eq("contact_id", contact.id)
              .maybeSingle();
            if (member) exitReason = "segment";
          }

          if (!exitReason && exit.onReply) {
            const { data: replied } = await admin
              .from("events")
              .select("id")
              .eq("org_id", orgId)
              .eq("workflow_id", workflowId)
              .eq("contact_id", contact.id)
              .eq("type", "replied")
              .limit(1)
              .maybeSingle();
            if (replied) exitReason = "reply";
          }

          if (exitReason) {
            await admin
              .from("workflow_runs")
              .update({ status: "stopped", ended_at: new Date().toISOString() })
              .eq("id", runId);
            await admin.from("events").insert({
              org_id: orgId,
              type: "exited",
              contact_id: contact.id,
              workflow_id: workflowId,
              workflow_node_id: node.id,
              metadata: { reason: exitReason },
            });
            return { stop: true, next: null };
          }
        }

        const { data: rs } = await admin
          .from("workflow_run_steps")
          .insert({
            org_id: orgId,
            run_id: runId,
            node_id: node.id,
            node_type: node.data.action ?? node.data.kind,
            status: "entered",
          })
          .select("id")
          .single();

        let branch: boolean | undefined;
        // When set, this node needs an email sent. The actual provider send is
        // deferred to an isolated step below so a retry of the bookkeeping can
        // never re-send (see the campaign engine for the same pattern).
        let sendPayload:
          | {
              from: string;
              to: string;
              subject: string;
              html: string;
              headers: Record<string, string>;
            }
          | null = null;
        try {
          switch (node.data.action) {
            case "send_email": {
              if (contact.email) {
                // Never email a suppressed (unsubscribed/bounced) address.
                const { data: supp } = await admin
                  .from("suppressions")
                  .select("id")
                  .eq("org_id", orgId)
                  .eq("email", contact.email)
                  .maybeSingle();
                if (supp) {
                  await admin.from("events").insert({
                    org_id: orgId,
                    type: "skipped",
                    contact_id: contact.id,
                    workflow_id: workflowId,
                    workflow_node_id: node.id,
                    metadata: { reason: "suppressed" },
                  });
                  break;
                }
                let from = defaultFrom();
                if (wf.mailbox_id) {
                  const { data: m } = await admin
                    .from("mailboxes")
                    .select("email, display_name")
                    .eq("id", wf.mailbox_id)
                    .single();
                  if (m) from = `${m.display_name ?? ""} <${m.email}>`.trim();
                }
                const cfg = node.data.config ?? {};
                const subject = renderTemplate(String(cfg.subject ?? ""), merge);
                const html = wrapEmail(
                  withUnsubscribe(
                    renderTemplate(String(cfg.body ?? ""), merge),
                    unsubUrl(contact.id, "")
                  )
                );
                sendPayload = {
                  from,
                  to: contact.email,
                  subject,
                  html,
                  headers: unsubHeaders(contact.id, ""),
                };
              }
              break;
            }
            case "set_lifecycle": {
              const stage = String(node.data.config?.stage ?? "");
              if (
                LIFECYCLE_STAGES.includes(stage as LifecycleStage) &&
                contact.lifecycle_stage !== stage
              ) {
                await admin
                  .from("contacts")
                  .update({ lifecycle_stage: stage })
                  .eq("id", contact.id);
                // Let stage-change triggers / goal-exits react to this change.
                await inngest.send({
                  name: "contact/stage.changed",
                  data: {
                    orgId,
                    contactId: contact.id,
                    from: contact.lifecycle_stage,
                    to: stage,
                  },
                });
              }
              break;
            }
            case "add_to_segment": {
              const segmentId = String(node.data.config?.segmentId ?? "");
              if (segmentId) {
                await admin.from("segment_members").upsert(
                  {
                    org_id: orgId,
                    segment_id: segmentId,
                    contact_id: contact.id,
                  },
                  { onConflict: "segment_id,contact_id", ignoreDuplicates: true }
                );
              }
              break;
            }
            case "enroll_campaign": {
              // Bridge into the campaign engine: enrol this contact into the
              // chosen sequence (same eligibility rules as manual enrolment),
              // then kick the send engine for each new enrollment.
              const campaignId = String(node.data.config?.campaignId ?? "");
              if (campaignId) {
                const enrolledIds = await enrollContacts(admin, {
                  orgId,
                  campaignId,
                  contactIds: [contact.id],
                });
                if (enrolledIds.length) {
                  await inngest.send(
                    enrolledIds.map((eid) => ({
                      name: "campaign/enrollment.started",
                      data: { enrollmentId: eid },
                    }))
                  );
                }
              }
              break;
            }
            case "move_to_workflow": {
              // Transfer: start a run in the target workflow. This node is
              // terminal (no outgoing edge), so the current run ends after it.
              const targetId = String(node.data.config?.workflowId ?? "");
              if (targetId && targetId !== workflowId) {
                const movedRunIds = await enrollContactsInWorkflow(
                  admin,
                  orgId,
                  targetId,
                  [contact.id],
                  // Bound A→B→A move loops: don't re-move a contact into a
                  // workflow they ran in the last hour.
                  { cooldownMinutes: WORKFLOW_REENROLL_COOLDOWN_MIN }
                );
                if (movedRunIds.length) {
                  await inngest.send(
                    movedRunIds.map((rid) => ({
                      name: "workflow/run.started",
                      data: { runId: rid },
                    }))
                  );
                }
              }
              break;
            }
            case "end_flow":
              // Terminal marker: no outgoing edge, so the run completes here.
              break;
            case "webhook": {
              const url = String(node.data.config?.url ?? "");
              if (/^https:\/\/.+/i.test(url)) {
                const res = await fetch(url, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    workflow_id: workflowId,
                    node_id: node.id,
                    contact: {
                      id: contact.id,
                      email: contact.email,
                      first_name: contact.first_name,
                      last_name: contact.last_name,
                      lifecycle_stage: contact.lifecycle_stage,
                      company: contact.companies?.name ?? null,
                    },
                  }),
                });
                await admin.from("events").insert({
                  org_id: orgId,
                  type: res.ok ? "webhook" : "failed",
                  contact_id: contact.id,
                  workflow_id: workflowId,
                  workflow_node_id: node.id,
                  metadata: { url, status: res.status },
                });
              }
              break;
            }
            case "branch": {
              branch = evaluateBranch(node, contact);
              break;
            }
          }
          // For a pending send, defer marking the step complete until after the
          // isolated send step succeeds.
          if (!sendPayload) {
            await admin
              .from("workflow_run_steps")
              .update({ status: "completed", completed_at: new Date().toISOString() })
              .eq("id", rs?.id);
          }
        } catch (e) {
          await admin
            .from("workflow_run_steps")
            .update({
              status: "failed",
              completed_at: new Date().toISOString(),
            })
            .eq("id", rs?.id);
          void e;
        }

        const next =
          node.data.action === "branch"
            ? nextNodeId(graph, node.id, branch)
            : nextNodeId(graph, node.id);

        // Defer advancing current_node when a send is pending — the send +
        // record steps below own that transition so the node isn't marked done
        // until the email has actually gone out.
        if (sendPayload) {
          return {
            stop: false,
            next,
            send: sendPayload,
            rsId: (rs?.id as string | undefined) ?? null,
          };
        }

        await admin
          .from("workflow_runs")
          .update({ current_node: next })
          .eq("id", runId);
        return { stop: false, next };
      });

      if (outcome.stop) return { stopped: true };

      // Isolated, non-idempotent send. Once it succeeds Inngest memoizes it, so
      // a failure in the record step only retries the record — never the send.
      if ("send" in outcome && outcome.send) {
        // Respect the org's send window before dispatching the email.
        const windowWaitUntil = await step.run(
          `node-window-${node.id}`,
          async () => {
            const target = nextSendTime(new Date(), ctx.sendWindow);
            return target.getTime() > Date.now() ? target.toISOString() : null;
          }
        );
        if (windowWaitUntil) {
          await step.sleepUntil(
            `node-window-wait-${node.id}`,
            new Date(windowWaitUntil)
          );
        }

        const res = await step.run(`node-send-${node.id}`, async () =>
          getEmailProvider().send(outcome.send)
        );
        await step.run(`node-record-${node.id}`, async () => {
          await admin.from("events").insert({
            org_id: orgId,
            type: res.status === "sent" ? "sent" : "failed",
            contact_id: contact.id,
            workflow_id: workflowId,
            workflow_node_id: node.id,
            metadata: { message_id: res.id, error: res.error ?? null },
          });
          if (outcome.rsId) {
            await admin
              .from("workflow_run_steps")
              .update({
                status: "completed",
                completed_at: new Date().toISOString(),
              })
              .eq("id", outcome.rsId);
          }
          await admin
            .from("workflow_runs")
            .update({ current_node: outcome.next })
            .eq("id", runId);
        });
      }

      current = outcome.next ?? null;
    }

    await step.run("complete", async () => {
      await admin
        .from("workflow_runs")
        .update({ status: "completed", ended_at: new Date().toISOString() })
        .eq("id", runId);
    });
    return { completed: true };
  }
);

/**
 * Auto-enroll workflows on segment entry. Consumes the `segment/members.changed`
 * event emitted by the segment re-evaluation cron.
 */
export const workflowSegmentEntry = inngest.createFunction(
  { id: "workflow-segment-entry", triggers: [{ event: "segment/members.changed" }] },
  async ({ event, step }) => {
    const admin = createAdminClient();
    const segmentId = event.data.segmentId as string | undefined;
    const orgId = event.data.orgId as string | undefined;
    const added = event.data.added as string[] | undefined;
    if (!segmentId || !orgId || !Array.isArray(added) || !added.length)
      return { skipped: true };

    const { data: workflows } = await admin
      .from("workflows")
      .select("id, trigger_config")
      .eq("org_id", orgId)
      .eq("trigger_type", "segment_entry")
      .eq("status", "running");

    const matching = (workflows ?? []).filter(
      (w) =>
        (w.trigger_config as { segmentId?: string })?.segmentId === segmentId
    );

    let created = 0;
    for (const wf of matching) {
      const { data: active } = await admin
        .from("workflow_runs")
        .select("contact_id")
        .eq("workflow_id", wf.id)
        .eq("status", "active");
      const activeSet = new Set(
        (active ?? []).map((r) => (r as { contact_id: string }).contact_id)
      );
      const eligible = added.filter((id) => !activeSet.has(id));
      if (!eligible.length) continue;

      const { data: runs } = await admin
        .from("workflow_runs")
        .insert(
          eligible.map((cid) => ({
            org_id: orgId,
            workflow_id: wf.id,
            contact_id: cid,
            status: "active",
          }))
        )
        .select("id");

      if (runs?.length) {
        await step.sendEvent(
          `kick-${wf.id}`,
          runs.map((r) => ({
            name: "workflow/run.started",
            data: { runId: (r as { id: string }).id },
          }))
        );
        created += runs.length;
      }
    }
    return { created };
  }
);

/**
 * Enroll a set of contacts into a workflow, skipping any that already have an
 * active run (the DB also enforces this via a partial unique index). Returns the
 * newly-created run ids. Shared by every trigger handler.
 *
 * Options bound re-enrollment beyond the active-run guard:
 * - `cooldownMinutes`: also skip contacts who *started* a run for this workflow
 *   within the window. Bounds tight cross-workflow loops (A→B→A move chains,
 *   set_lifecycle → stage_change ping-pong) that would otherwise re-enroll
 *   instantly because each run completes before the next begins.
 * - `oncePerContact`: skip contacts who have *ever* run this workflow. Used for
 *   engagement triggers, where a chatty open/click pixel (email clients reload
 *   tracked mail for weeks) must not spin up a fresh run on every reload.
 */
async function enrollContactsInWorkflow(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  workflowId: string,
  contactIds: string[],
  opts: { cooldownMinutes?: number; oncePerContact?: boolean } = {}
): Promise<string[]> {
  if (!contactIds.length) return [];

  const blocked = new Set<string>();

  if (opts.oncePerContact) {
    const { data: ever } = await admin
      .from("workflow_runs")
      .select("contact_id")
      .eq("workflow_id", workflowId)
      .in("contact_id", contactIds);
    for (const r of ever ?? [])
      blocked.add((r as { contact_id: string }).contact_id);
  } else {
    const { data: active } = await admin
      .from("workflow_runs")
      .select("contact_id")
      .eq("workflow_id", workflowId)
      .eq("status", "active");
    for (const r of active ?? [])
      blocked.add((r as { contact_id: string }).contact_id);

    if (opts.cooldownMinutes && opts.cooldownMinutes > 0) {
      const since = new Date(
        Date.now() - opts.cooldownMinutes * 60_000
      ).toISOString();
      const { data: recent } = await admin
        .from("workflow_runs")
        .select("contact_id")
        .eq("workflow_id", workflowId)
        .gte("started_at", since);
      for (const r of recent ?? [])
        blocked.add((r as { contact_id: string }).contact_id);
    }
  }

  const eligible = contactIds.filter((id) => !blocked.has(id));
  if (!eligible.length) return [];

  const { data: runs } = await admin
    .from("workflow_runs")
    .insert(
      eligible.map((cid) => ({
        org_id: orgId,
        workflow_id: workflowId,
        contact_id: cid,
        status: "active",
      }))
    )
    .select("id");
  return (runs ?? []).map((r) => (r as { id: string }).id);
}

// Contacts re-enrolled into the same workflow within this window are treated as
// a runaway loop and skipped (see enrollContactsInWorkflow).
const WORKFLOW_REENROLL_COOLDOWN_MIN = 60;

/**
 * Stop every active run for a contact whose workflow matches `predicate`
 * (evaluated against the workflow's parsed exit_config). Used for exit-on-reply
 * and exit-on-goal. Records an `exited` event per stopped run.
 */
async function exitRunsForContact(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  contactId: string,
  reason: string,
  predicate: (exit: ReturnType<typeof parseExitConfig>) => boolean
): Promise<number> {
  const { data: runs } = await admin
    .from("workflow_runs")
    .select("id, workflow_id")
    .eq("org_id", orgId)
    .eq("contact_id", contactId)
    .eq("status", "active");
  if (!runs?.length) return 0;

  const runRows = runs as { id: string; workflow_id: string }[];
  const { data: wfs } = await admin
    .from("workflows")
    .select("id, exit_config")
    .in("id", [...new Set(runRows.map((r) => r.workflow_id))]);
  const exitByWf = new Map(
    (wfs ?? []).map((w) => {
      const row = w as { id: string; exit_config: unknown };
      return [row.id, parseExitConfig(row.exit_config)];
    })
  );

  let stopped = 0;
  for (const row of runRows) {
    const exit = exitByWf.get(row.workflow_id);
    if (!exit || !predicate(exit)) continue;
    await admin
      .from("workflow_runs")
      .update({ status: "stopped", ended_at: new Date().toISOString() })
      .eq("id", row.id);
    await admin.from("events").insert({
      org_id: orgId,
      type: "exited",
      contact_id: contactId,
      workflow_id: row.workflow_id,
      metadata: { reason },
    });
    stopped++;
  }
  return stopped;
}

/**
 * React to a contact reply: exit any active run set to stop-on-reply, and
 * enroll the contact into every active `reply`-triggered workflow.
 */
export const workflowReplyTrigger = inngest.createFunction(
  { id: "workflow-reply-trigger", triggers: [{ event: "contact/replied" }] },
  async ({ event, step }) => {
    const admin = createAdminClient();
    const orgId = event.data.orgId as string | undefined;
    const contactId = event.data.contactId as string | undefined;
    if (!orgId || !contactId) return { skipped: true };

    const exited = await step.run("exit-on-reply", () =>
      exitRunsForContact(admin, orgId, contactId, "reply", (e) => e.onReply === true)
    );

    const runIds = await step.run("enroll-reply-workflows", async () => {
      const { data: workflows } = await admin
        .from("workflows")
        .select("id")
        .eq("org_id", orgId)
        .eq("trigger_type", "reply")
        .eq("status", "running");
      const all: string[] = [];
      for (const wf of workflows ?? []) {
        all.push(
          ...(await enrollContactsInWorkflow(
            admin,
            orgId,
            (wf as { id: string }).id,
            [contactId]
          ))
        );
      }
      return all;
    });

    if (runIds.length) {
      await step.sendEvent(
        "kick-reply",
        runIds.map((id) => ({
          name: "workflow/run.started",
          data: { runId: id },
        }))
      );
    }
    return { exited, enrolled: runIds.length };
  }
);

/**
 * React to a contact lifecycle-stage change: exit any active run whose goal is
 * the new stage, and enroll the contact into `stage_change`-triggered workflows
 * whose target stage matches (or that target any stage change).
 */
export const workflowStageChange = inngest.createFunction(
  { id: "workflow-stage-change", triggers: [{ event: "contact/stage.changed" }] },
  async ({ event, step }) => {
    const admin = createAdminClient();
    const orgId = event.data.orgId as string | undefined;
    const contactId = event.data.contactId as string | undefined;
    const to = event.data.to as string | undefined;
    if (!orgId || !contactId || !to) return { skipped: true };

    const exited = await step.run("exit-on-goal", () =>
      exitRunsForContact(admin, orgId, contactId, "goal", (e) => e.goalStage === to)
    );

    const runIds = await step.run("enroll-stage-workflows", async () => {
      const { data: workflows } = await admin
        .from("workflows")
        .select("id, trigger_config")
        .eq("org_id", orgId)
        .eq("trigger_type", "stage_change")
        .eq("status", "running");
      const matching = (workflows ?? []).filter((w) => {
        const target = (w.trigger_config as { stage?: string })?.stage;
        return !target || target === to;
      });
      const all: string[] = [];
      for (const wf of matching) {
        all.push(
          ...(await enrollContactsInWorkflow(
            admin,
            orgId,
            (wf as { id: string }).id,
            [contactId],
            // Bound set_lifecycle → stage_change → set_lifecycle ping-pong.
            { cooldownMinutes: WORKFLOW_REENROLL_COOLDOWN_MIN }
          ))
        );
      }
      return all;
    });

    if (runIds.length) {
      await step.sendEvent(
        "kick-stage",
        runIds.map((id) => ({
          name: "workflow/run.started",
          data: { runId: id },
        }))
      );
    }
    return { exited, enrolled: runIds.length };
  }
);

/**
 * Activity-logged workflow trigger. Consumes `contact/activity.logged` (emitted
 * by the addActivity action) and enrolls the contact into every active
 * `activity_logged` workflow whose configured activityType matches ("any" or
 * unset matches every type — e.g. an "appointment booked" workflow narrows to
 * the `appointment` activity type).
 */
export const workflowActivityTrigger = inngest.createFunction(
  { id: "workflow-activity-trigger", triggers: [{ event: "contact/activity.logged" }] },
  async ({ event, step }) => {
    const admin = createAdminClient();
    const orgId = event.data.orgId as string | undefined;
    const contactId = event.data.contactId as string | undefined;
    const activityType = event.data.activityType as string | undefined;
    if (!orgId || !contactId || !activityType) return { skipped: true };

    const runIds = await step.run("enroll-activity-workflows", async () => {
      const { data: workflows } = await admin
        .from("workflows")
        .select("id, trigger_config")
        .eq("org_id", orgId)
        .eq("trigger_type", "activity_logged")
        .eq("status", "running");
      const matching = (workflows ?? []).filter((w) => {
        const want = (w.trigger_config as { activityType?: string })?.activityType;
        return !want || want === "any" || want === activityType;
      });
      const all: string[] = [];
      for (const wf of matching) {
        all.push(
          ...(await enrollContactsInWorkflow(
            admin,
            orgId,
            (wf as { id: string }).id,
            [contactId]
          ))
        );
      }
      return all;
    });

    if (runIds.length) {
      await step.sendEvent(
        "kick-activity",
        runIds.map((id) => ({ name: "workflow/run.started", data: { runId: id } }))
      );
    }
    return { enrolled: runIds.length };
  }
);

/**
 * Enroll a contact into every active workflow with the given engagement
 * `triggerType` (email_opened / email_clicked) and kick the new runs. Shared by
 * the open and click consumers below. The active-run guard in
 * `enrollContactsInWorkflow` keeps a chatty pixel/redirect (clients often reload
 * tracked emails) from starting duplicate runs.
 */
async function enrollEngagementWorkflows(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  contactId: string,
  triggerType: "email_opened" | "email_clicked"
): Promise<string[]> {
  const { data: workflows } = await admin
    .from("workflows")
    .select("id")
    .eq("org_id", orgId)
    .eq("trigger_type", triggerType)
    .eq("status", "running");
  const all: string[] = [];
  for (const wf of workflows ?? []) {
    all.push(
      ...(await enrollContactsInWorkflow(
        admin,
        orgId,
        (wf as { id: string }).id,
        [contactId],
        // Open/click pixels fire repeatedly for the same contact for weeks —
        // enroll them once per workflow, not on every reload.
        { oncePerContact: true }
      ))
    );
  }
  return all;
}

/**
 * Email-open workflow trigger. Consumes `contact/email.opened` (emitted by the
 * open-tracking pixel route) and enrolls the contact into active `email_opened`
 * workflows.
 */
export const workflowEmailOpened = inngest.createFunction(
  { id: "workflow-email-opened", triggers: [{ event: "contact/email.opened" }] },
  async ({ event, step }) => {
    const admin = createAdminClient();
    const orgId = event.data.orgId as string | undefined;
    const contactId = event.data.contactId as string | undefined;
    if (!orgId || !contactId) return { skipped: true };

    const runIds = await step.run("enroll-open-workflows", () =>
      enrollEngagementWorkflows(admin, orgId, contactId, "email_opened")
    );
    if (runIds.length) {
      await step.sendEvent(
        "kick-open",
        runIds.map((id) => ({ name: "workflow/run.started", data: { runId: id } }))
      );
    }
    return { enrolled: runIds.length };
  }
);

/**
 * Link-click workflow trigger. Consumes `contact/email.clicked` (emitted by the
 * click-tracking redirect route) and enrolls the contact into active
 * `email_clicked` workflows.
 */
export const workflowEmailClicked = inngest.createFunction(
  { id: "workflow-email-clicked", triggers: [{ event: "contact/email.clicked" }] },
  async ({ event, step }) => {
    const admin = createAdminClient();
    const orgId = event.data.orgId as string | undefined;
    const contactId = event.data.contactId as string | undefined;
    if (!orgId || !contactId) return { skipped: true };

    const runIds = await step.run("enroll-click-workflows", () =>
      enrollEngagementWorkflows(admin, orgId, contactId, "email_clicked")
    );
    if (runIds.length) {
      await step.sendEvent(
        "kick-click",
        runIds.map((id) => ({ name: "workflow/run.started", data: { runId: id } }))
      );
    }
    return { enrolled: runIds.length };
  }
);

/** All functions served by the /api/inngest endpoint. */
export const functions = [
  helloWorld,
  reevaluateSegments,
  campaignEngine,
  workflowRun,
  workflowSegmentEntry,
  workflowReplyTrigger,
  workflowStageChange,
  workflowActivityTrigger,
  workflowEmailOpened,
  workflowEmailClicked,
];
