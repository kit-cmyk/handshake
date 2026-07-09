import { describe, it, expect } from "vitest";
import { computeFunnel, pct, type EventLite, type StepInfo } from "./funnel";

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
