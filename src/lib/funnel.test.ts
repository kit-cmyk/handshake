import { describe, it, expect } from "vitest";
import {
  campaignFlow,
  computeFunnel,
  pct,
  topReplyStep,
  type CampaignFunnel,
  type EventLite,
  type FunnelStage,
  type StepInfo,
} from "./funnel";

const steps: StepInfo[] = [
  { id: "s1", position: 0, subject: "Intro" },
  { id: "s2", position: 1, subject: "Follow-up" },
];

function ev(
  campaign_step_id: string | null,
  contact_id: string | null,
  type: string
): EventLite {
  return { campaign_step_id, contact_id, type };
}

describe("computeFunnel", () => {
  it("counts distinct contacts per step and stage", () => {
    const events: EventLite[] = [
      // Step 1: 2 sent, 1 opened (c1 opened twice → still 1)
      ev("s1", "c1", "sent"),
      ev("s1", "c2", "sent"),
      ev("s1", "c1", "opened"),
      ev("s1", "c1", "opened"),
      // Step 2: 1 sent, 1 replied
      ev("s2", "c1", "sent"),
      ev("s2", "c1", "replied"),
    ];
    const f = computeFunnel(steps, events);

    expect(f.steps[0].stages.sent).toBe(2);
    expect(f.steps[0].stages.opened).toBe(1); // deduped
    expect(f.steps[1].stages.sent).toBe(1);
    expect(f.steps[1].stages.replied).toBe(1);
  });

  it("computes campaign-wide distinct totals across steps", () => {
    const events: EventLite[] = [
      ev("s1", "c1", "sent"),
      ev("s2", "c1", "sent"), // same contact, two steps → 1 distinct sent
      ev("s1", "c2", "sent"),
    ];
    const f = computeFunnel(steps, events);
    expect(f.totals.sent).toBe(2); // c1, c2
  });

  it("tallies bounced / unsubscribed / failed side metrics", () => {
    const events: EventLite[] = [
      ev("s1", "c1", "bounced"),
      ev(null, "c2", "unsubscribed"),
      ev("s1", "c3", "failed"),
    ];
    const f = computeFunnel(steps, events);
    expect(f.bounced).toBe(1);
    expect(f.unsubscribed).toBe(1);
    expect(f.failed).toBe(1);
  });

  it("ignores events with no contact", () => {
    const f = computeFunnel(steps, [ev("s1", null, "sent")]);
    expect(f.steps[0].stages.sent).toBe(0);
  });

  it("orders steps by position regardless of input order", () => {
    const f = computeFunnel(
      [
        { id: "b", position: 1, subject: "B" },
        { id: "a", position: 0, subject: "A" },
      ],
      []
    );
    expect(f.steps.map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("pct", () => {
  it("computes whole-number percentages", () => {
    expect(pct(1, 2)).toBe(50);
    expect(pct(1, 3)).toBe(33);
  });
  it("returns 0 for a zero denominator", () => {
    expect(pct(5, 0)).toBe(0);
  });
});

describe("campaignFlow", () => {
  const funnel = (
    steps: { id: string; subject: string; stages: Partial<Record<FunnelStage, number>> }[],
    totals: Partial<Record<FunnelStage, number>> = {}
  ): CampaignFunnel => ({
    steps: steps.map((s, i) => ({
      id: s.id,
      position: i,
      subject: s.subject,
      stages: {
        sent: 0,
        opened: 0,
        clicked: 0,
        replied: 0,
        booked: 0,
        ...s.stages,
      },
    })),
    totals: {
      sent: 0,
      opened: 0,
      clicked: 0,
      replied: 0,
      booked: 0,
      ...totals,
    },
    bounced: 0,
    unsubscribed: 0,
    failed: 0,
  });

  const three = funnel(
    [
      { id: "s1", subject: "Intro", stages: { sent: 100, opened: 40, replied: 5 } },
      { id: "s2", subject: "Nudge", stages: { sent: 80, opened: 30, replied: 12 } },
      { id: "s3", subject: "Last call", stages: { sent: 50, replied: 3 } },
    ],
    { sent: 100, replied: 20, booked: 6 }
  );

  const flow = campaignFlow(three, 120);
  const ribbon = (from: string, to: string) =>
    flow.links.find((l) => l.sourceName === from && l.targetName === to);

  it("counts the whole enrolled cohort out of the first column", () => {
    const out = flow.links
      .filter((l) => l.sourceName === "Enrolled")
      .reduce((sum, l) => sum + l.value, 0);
    expect(out).toBe(120);
    expect(ribbon("Enrolled", "Email 1")?.value).toBe(100);
    expect(ribbon("Enrolled", "No email sent")?.value).toBe(20);
  });

  it("conserves the cohort through every email", () => {
    for (const step of ["Email 1", "Email 2", "Email 3"]) {
      const into = flow.links
        .filter((l) => l.targetName === step)
        .reduce((sum, l) => sum + l.value, 0);
      const outOf = flow.links
        .filter((l) => l.sourceName === step)
        .reduce((sum, l) => sum + l.value, 0);
      expect(outOf).toBe(into);
    }
  });

  it("splits each email into advanced, replied and silent", () => {
    expect(ribbon("Email 1", "Email 2")?.value).toBe(80);
    expect(ribbon("Email 1", "Replied")?.value).toBe(5);
    expect(ribbon("Email 1", "No reply")?.value).toBe(15); // 100 - 80 - 5
    // The last email has nowhere to advance to: all 50 end there.
    expect(ribbon("Email 3", "Email 3")).toBeUndefined();
    expect(ribbon("Email 3", "Replied")?.value).toBe(3);
    expect(ribbon("Email 3", "No reply")?.value).toBe(47);
  });

  it("hangs bookings off the replies that fed them", () => {
    // 5 + 12 + 3 replies reached the node; 6 of them booked.
    expect(ribbon("Replied", "Meeting booked")?.value).toBe(6);
    expect(ribbon("Replied", "Replied, no meeting")?.value).toBe(14);
  });

  it("clamps a stage figure that outruns the flow feeding it", () => {
    // A booked count larger than the replies on record can't widen the ribbon.
    const odd = campaignFlow(
      funnel([{ id: "s1", subject: "One", stages: { sent: 10, replied: 2 } }], {
        booked: 99,
      }),
      10
    );
    expect(
      odd.links.find((l) => l.targetName === "Meeting booked")?.value
    ).toBe(2);
    expect(
      odd.links.find((l) => l.targetName === "Replied, no meeting")
    ).toBeUndefined();
  });

  it("trusts sends over a missing enrollment count", () => {
    const cleaned = campaignFlow(
      funnel([{ id: "s1", subject: "One", stages: { sent: 30 } }]),
      0
    );
    expect(
      cleaned.links.find((l) => l.sourceName === "Enrolled")?.value
    ).toBe(30);
    expect(
      cleaned.links.find((l) => l.targetName === "No email sent")
    ).toBeUndefined();
  });

  it("has nothing to draw for a campaign with no steps", () => {
    expect(campaignFlow(funnel([]), 10).links).toEqual([]);
  });
});

describe("topReplyStep", () => {
  const withReplies = (counts: [number, number][]): CampaignFunnel => ({
    steps: counts.map(([sent, replied], i) => ({
      id: `s${i}`,
      position: i,
      subject: `Step ${i + 1}`,
      stages: { sent, opened: 0, clicked: 0, replied, booked: 0 },
    })),
    totals: { sent: 0, opened: 0, clicked: 0, replied: 0, booked: 0 },
    bounced: 0,
    unsubscribed: 0,
    failed: 0,
  });

  it("picks the step with the most replies and rates it against its sends", () => {
    const best = topReplyStep(withReplies([[100, 5], [80, 12], [50, 3]]))!;
    expect(best.step).toBe(2);
    expect(best.replied).toBe(12);
    expect(best.rate).toBe(15);
  });

  it("keeps the earliest step on a tie", () => {
    expect(topReplyStep(withReplies([[100, 4], [100, 4]]))!.step).toBe(1);
  });

  it("is null when nothing has replied", () => {
    expect(topReplyStep(withReplies([[100, 0]]))).toBeNull();
  });
});
