// Pure campaign-funnel aggregation over the append-only events table.
// Distinct-contact counts per step and per stage. No I/O — testable.

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
