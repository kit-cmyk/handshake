import { describe, it, expect } from "vitest";
import {
  dealsForStatus,
  missingValueCount,
  monthKey,
  monthKeyBefore,
  monthStartIso,
  monthOverMonthDelta,
  revenueSeries,
  valueForStatus,
  winRate,
  type RevenueRow,
  type StatusTotalRow,
} from "./metrics";

/**
 * `deal_revenue_by_month` buckets on date_trunc in UTC, so every boundary here
 * is asserted in UTC. A local-time month boundary would make the headline
 * figure and the chart disagree around the turn of each month.
 */

const AUG = new Date("2026-08-15T12:00:00Z");

const revenue: RevenueRow[] = [
  { month: "2026-08-01", status: "won", deals: 3, value: 42500 },
  { month: "2026-08-01", status: "lost", deals: 1, value: 5000 },
  { month: "2026-07-01", status: "won", deals: 2, value: 36000 },
  { month: "2026-07-01", status: "lost", deals: 3, value: 9000 },
  // June: nothing closed at all.
  { month: "2026-05-01", status: "won", deals: 1, value: 12000 },
];

describe("month boundaries", () => {
  it("keys a month from a mid-month instant", () => {
    expect(monthKey(AUG)).toBe("2026-08-01");
  });

  it("walks back across a year boundary", () => {
    const jan = new Date("2026-01-20T00:00:00Z");
    expect(monthKeyBefore(jan, 1)).toBe("2025-12-01");
    expect(monthKeyBefore(jan, 13)).toBe("2024-12-01");
  });

  it("treats the last instant of a UTC month as that month", () => {
    // 23:59Z on 31 Aug is already September in Sydney. The view says August,
    // so this must too.
    expect(monthKey(new Date("2026-08-31T23:59:59Z"))).toBe("2026-08-01");
  });

  it("gives the month start as a UTC instant", () => {
    expect(monthStartIso(AUG)).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("status totals", () => {
  const totals: StatusTotalRow[] = [
    { status: "open", deals: 22, value: 128000, missing_value: 4 },
    { status: "won", deals: 6, value: 78500, missing_value: 0 },
  ];

  it("reads value and count for a present status", () => {
    expect(valueForStatus(totals, "open")).toBe(128000);
    expect(dealsForStatus(totals, "open")).toBe(22);
  });

  it("returns zero for a status with no row rather than undefined", () => {
    // A workspace that has never lost a deal has no 'lost' row at all.
    expect(valueForStatus(totals, "lost")).toBe(0);
    expect(dealsForStatus(totals, "lost")).toBe(0);
  });

  it("surfaces open deals carrying no value", () => {
    expect(missingValueCount(totals)).toBe(4);
  });
});

describe("monthOverMonthDelta", () => {
  it("computes the change against last month", () => {
    // 42500 vs 36000 = +18.05%
    expect(Math.round(monthOverMonthDelta(revenue, AUG)!)).toBe(18);
  });

  it("goes negative when the month is down", () => {
    const jul = new Date("2026-07-10T00:00:00Z");
    // July 36000 vs June 0 -> previous is zero, so null (see next test).
    // Use May->Jun instead: nothing in June, so a drop from May is -100%.
    const jun = new Date("2026-06-10T00:00:00Z");
    expect(monthOverMonthDelta(revenue, jun)).toBe(-100);
    expect(monthOverMonthDelta(revenue, jul)).toBeNull();
  });

  it("returns null when last month had nothing to compare against", () => {
    // Every comparison against zero is either infinite or meaningless, so the
    // tile shows no chip rather than inventing a number.
    const may = new Date("2026-05-10T00:00:00Z");
    expect(monthOverMonthDelta(revenue, may)).toBeNull();
  });
});

describe("winRate", () => {
  it("counts deals, not value, across the trailing window", () => {
    // Trailing 3 months is Jun-Aug. June closed nothing, so the window is
    // Jul + Aug: won 2+3=5, lost 3+1=4 -> 5/9 = 56%.
    expect(winRate(revenue, AUG)).toBe(56);
  });

  it("returns null when nothing has closed in the window", () => {
    const future = new Date("2027-06-15T00:00:00Z");
    expect(winRate(revenue, future)).toBeNull();
  });

  it("is 100 when nothing was lost", () => {
    const wonOnly: RevenueRow[] = [
      { month: "2026-08-01", status: "won", deals: 4, value: 1000 },
    ];
    expect(winRate(wonOnly, AUG)).toBe(100);
  });
});

describe("revenueSeries", () => {
  it("returns the trailing months oldest first", () => {
    const s = revenueSeries(revenue, AUG, 6);
    expect(s).toHaveLength(6);
    expect(s[0].month).toBe("2026-03-01");
    expect(s[5].month).toBe("2026-08-01");
  });

  it("fills months with no closed business with zero", () => {
    // June closed nothing. Skipping it would hide a quiet month entirely.
    const s = revenueSeries(revenue, AUG, 6);
    expect(s.find((p) => p.month === "2026-06-01")?.value).toBe(0);
    expect(s.find((p) => p.month === "2026-08-01")?.value).toBe(42500);
  });

  it("ignores lost deals", () => {
    const s = revenueSeries(revenue, AUG, 6);
    // August had 5000 of lost value that must not appear in the won series.
    expect(s.find((p) => p.month === "2026-08-01")?.value).toBe(42500);
  });

  it("labels months in UTC", () => {
    const s = revenueSeries(revenue, AUG, 2);
    expect(s.map((p) => p.label)).toEqual(["Jul", "Aug"]);
  });

  it("handles a workspace with no closed deals at all", () => {
    const s = revenueSeries([], AUG, 6);
    expect(s).toHaveLength(6);
    expect(s.every((p) => p.value === 0)).toBe(true);
  });
});
