// Pure campaign-funnel aggregation over the append-only events table.
// Distinct-contact counts per step and per stage, plus the sequence flow the
// Sankey report draws. No I/O — testable.

import {
  buildFlow,
  EMPTY_FLOW,
  type Flow,
  type FlowLinkSpec,
  type FlowNodeSpec,
} from "./sankey";

export const FUNNEL_STAGES = [
  "sent",
  "opened",
  "clicked",
  "replied",
  "booked",
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const STAGE_LABELS: Record<FunnelStage, string> = {
  sent: "Sent",
  opened: "Opened",
  clicked: "Clicked",
  replied: "Replied",
  booked: "Booked",
};

export type EventLite = {
  campaign_step_id: string | null;
  contact_id: string | null;
  type: string;
};

export type StepInfo = { id: string; position: number; subject: string | null };

export type StepReport = {
  id: string;
  position: number;
  subject: string | null;
  stages: Record<FunnelStage, number>;
};

export type CampaignFunnel = {
  steps: StepReport[];
  totals: Record<FunnelStage, number>;
  bounced: number;
  unsubscribed: number;
  failed: number;
};

function addTo(
  map: Map<string, Map<string, Set<string>>>,
  key: string,
  type: string,
  contactId: string
) {
  let byType = map.get(key);
  if (!byType) map.set(key, (byType = new Map()));
  let set = byType.get(type);
  if (!set) byType.set(type, (set = new Set()));
  set.add(contactId);
}

function sizeOf(
  map: Map<string, Set<string>> | undefined,
  type: string
): number {
  return map?.get(type)?.size ?? 0;
}

export function computeFunnel(
  steps: StepInfo[],
  events: EventLite[]
): CampaignFunnel {
  const perStep = new Map<string, Map<string, Set<string>>>();
  const overall = new Map<string, Set<string>>();

  for (const ev of events) {
    if (!ev.contact_id) continue;
    // overall (campaign-wide distinct per type)
    let set = overall.get(ev.type);
    if (!set) overall.set(ev.type, (set = new Set()));
    set.add(ev.contact_id);
    // per step
    if (ev.campaign_step_id) {
      addTo(perStep, ev.campaign_step_id, ev.type, ev.contact_id);
    }
  }

  const ordered = [...steps].sort((a, b) => a.position - b.position);

  const stepReports: StepReport[] = ordered.map((s) => {
    const byType = perStep.get(s.id);
    const stages = {} as Record<FunnelStage, number>;
    for (const stage of FUNNEL_STAGES) stages[stage] = sizeOf(byType, stage);
    return { id: s.id, position: s.position, subject: s.subject, stages };
  });

  const totals = {} as Record<FunnelStage, number>;
  for (const stage of FUNNEL_STAGES) totals[stage] = overall.get(stage)?.size ?? 0;

  return {
    steps: stepReports,
    totals,
    bounced: overall.get("bounced")?.size ?? 0,
    unsubscribed: overall.get("unsubscribed")?.size ?? 0,
    failed: overall.get("failed")?.size ?? 0,
  };
}

/** Whole-number percentage; 0 when denominator is 0. */
export function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

// ---- Pre-aggregated counts --------------------------------------------------
// computeFunnel above needs every event row in memory, which means reading the
// whole events table to render a report. These build the same shape from the
// grouped counts the `campaign_funnel_totals` / `campaign_step_funnel` views
// return (migration 0042) — one row per group instead of one per event.

/** A row of `campaign_funnel_totals`: distinct contacts per type, campaign-wide. */
export type FunnelTotalRow = {
  campaign_id: string | null;
  type: string;
  contacts: number;
};

/** A row of `campaign_step_funnel`: distinct contacts per (step, type). */
export type StepFunnelRow = {
  campaign_step_id: string | null;
  type: string;
  contacts: number;
};

function emptyStages(): Record<FunnelStage, number> {
  const stages = {} as Record<FunnelStage, number>;
  for (const stage of FUNNEL_STAGES) stages[stage] = 0;
  return stages;
}

/** Stage totals for one campaign, from its `campaign_funnel_totals` rows. */
export function totalsFromCounts(
  rows: readonly FunnelTotalRow[]
): CampaignFunnel["totals"] {
  const totals = emptyStages();
  for (const r of rows) {
    if ((FUNNEL_STAGES as readonly string[]).includes(r.type)) {
      totals[r.type as FunnelStage] = r.contacts;
    }
  }
  return totals;
}

/**
 * Build a full CampaignFunnel from grouped counts. `totals` come from the
 * campaign-wide view and `stepRows` from the per-step view — they are counted
 * separately because a contact active on two steps is one distinct contact for
 * the campaign but appears under both steps.
 */
export function funnelFromCounts(
  steps: StepInfo[],
  totalRows: readonly FunnelTotalRow[],
  stepRows: readonly StepFunnelRow[]
): CampaignFunnel {
  const byStep = new Map<string, Map<string, number>>();
  for (const r of stepRows) {
    if (!r.campaign_step_id) continue;
    let types = byStep.get(r.campaign_step_id);
    if (!types) byStep.set(r.campaign_step_id, (types = new Map()));
    types.set(r.type, r.contacts);
  }

  const stepReports: StepReport[] = [...steps]
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const types = byStep.get(s.id);
      const stages = emptyStages();
      for (const stage of FUNNEL_STAGES) stages[stage] = types?.get(stage) ?? 0;
      return { id: s.id, position: s.position, subject: s.subject, stages };
    });

  const totalByType = new Map(totalRows.map((r) => [r.type, r.contacts]));

  return {
    steps: stepReports,
    totals: totalsFromCounts(totalRows),
    bounced: totalByType.get("bounced") ?? 0,
    unsubscribed: totalByType.get("unsubscribed") ?? 0,
    failed: totalByType.get("failed") ?? 0,
  };
}

// ---- Sequence flow (Sankey) -------------------------------------------------
// The per-stage bars above answer "how far did contacts get in this email?".
// They can't answer "where does the sequence lose people, and which email is
// the one that earns replies?" — for that each contact has to be followed along
// a single path, which is what the flow below draws.

/**
 * One row of the reply-attribution callout: the step that produced the most
 * replies, which is the closest thing a single-channel campaign has to a
 * "best channel".
 */
export type TopReplyStep = {
  /** 1-based position in the sequence, as the UI numbers it. */
  step: number;
  subject: string | null;
  replied: number;
  /** Replies as a share of that step's sends. */
  rate: number;
};

/** The step with the most replies. Null when nothing has replied yet. */
export function topReplyStep(funnel: CampaignFunnel): TopReplyStep | null {
  let best: TopReplyStep | null = null;
  for (let i = 0; i < funnel.steps.length; i++) {
    const s = funnel.steps[i];
    const replied = s.stages.replied;
    if (replied <= 0) continue;
    if (best !== null && replied <= best.replied) continue;
    best = {
      step: i + 1,
      subject: s.subject,
      replied,
      rate: pct(replied, s.stages.sent),
    };
  }
  return best;
}

/**
 * The campaign as a single path per contact: enrolled → the emails they
 * received → how their sequence ended.
 *
 * Every contact is counted exactly once in every column, which is what makes the
 * ribbon widths comparable — and what forces two compromises worth knowing about
 * when reading the chart:
 *
 * - A reply leaves the sequence at the *last email the contact received*. With
 *   stop-on-reply that is also the email they replied to; without it, a contact
 *   who replied to email 1 and still received email 3 is counted as ending at
 *   email 3. Per-email reply attribution is exactly what `topReplyStep` and the
 *   per-step bars carry, so nothing is lost — it just isn't this chart's job.
 * - Stage counts are distinct contacts per event type and don't strictly nest
 *   (a contact can reply without ever registering an open). Each figure is
 *   therefore clamped to the cohort that actually reached it, so a ribbon can
 *   never be wider than the flow feeding it.
 *
 * Opens and clicks aren't columns here on purpose: opening an email doesn't stop
 * you receiving the next one, so they can't split the path without
 * double-counting. They ride along as node hints instead.
 */
export function campaignFlow(funnel: CampaignFunnel, enrolled: number): Flow {
  const steps = funnel.steps;
  if (!steps.length) return EMPTY_FLOW;

  const nodes: FlowNodeSpec[] = [
    { id: "enrolled", label: "Enrolled", tone: "flow" },
  ];
  // Listed spine-first: `buildFlow` preserves node order and the renderer stacks
  // each column in it, so the emails stay on top and the exits hang below.
  steps.forEach((s, i) => {
    const engagement = `opened ${s.stages.opened} · clicked ${s.stages.clicked} · replied ${s.stages.replied}`;
    nodes.push({
      id: `step:${s.id}`,
      label: `Email ${i + 1}`,
      tone: "flow",
      hint: s.subject ? `“${s.subject}” · ${engagement}` : engagement,
    });
  });
  nodes.push(
    { id: "replied", label: "Replied", tone: "goal" },
    { id: "booked", label: "Meeting booked", tone: "goal" },
    { id: "no-reply", label: "No reply", tone: "drop" },
    {
      id: "no-meeting",
      label: "Replied, no meeting",
      tone: "drop",
      hint: "Replied but hasn't booked — the follow-up worth doing by hand.",
    },
    {
      id: "not-sent",
      label: "No email sent",
      tone: "fail",
      hint: "Enrolled but never sent to: suppressed, bounced, missing an address, or still queued.",
    }
  );

  const links: FlowLinkSpec[] = [];

  // Enrolled is the cohort. Trust whichever figure is larger: a campaign whose
  // enrollment rows were cleaned up can still have sends on record, and a
  // funnel narrower than its first email would be a lie in the other direction.
  const cohort = Math.max(enrolled, steps[0].stages.sent);
  let arrived = Math.min(steps[0].stages.sent, cohort);
  links.push({
    source: "enrolled",
    target: `step:${steps[0].id}`,
    value: arrived,
    tone: "flow",
  });
  links.push({
    source: "enrolled",
    target: "not-sent",
    value: cohort - arrived,
    tone: "fail",
  });

  let repliedTotal = 0;
  steps.forEach((s, i) => {
    const next = steps[i + 1];
    const advanced = next ? Math.min(next.stages.sent, arrived) : 0;
    const ended = arrived - advanced;
    const replied = Math.min(s.stages.replied, ended);
    repliedTotal += replied;

    if (next) {
      links.push({
        source: `step:${s.id}`,
        target: `step:${next.id}`,
        value: advanced,
        tone: "flow",
      });
    }
    links.push({
      source: `step:${s.id}`,
      target: "replied",
      value: replied,
      tone: "goal",
    });
    links.push({
      source: `step:${s.id}`,
      target: "no-reply",
      value: ended - replied,
      tone: "drop",
    });

    arrived = advanced;
  });

  const booked = Math.min(funnel.totals.booked, repliedTotal);
  links.push({
    source: "replied",
    target: "booked",
    value: booked,
    tone: "goal",
  });
  links.push({
    source: "replied",
    target: "no-meeting",
    value: repliedTotal - booked,
    tone: "drop",
  });

  return buildFlow(nodes, links);
}
