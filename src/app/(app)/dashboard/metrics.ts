/**
 * Pure arithmetic behind the dashboard's headline numbers.
 *
 * Kept free of I/O so the parts that are easy to get subtly wrong — month
 * boundaries, a delta against a month with no activity, a win rate with nothing
 * closed — are unit-testable without a database.
 *
 * Everything here works in **UTC**. `deal_revenue_by_month` buckets on
 * `date_trunc('month', closed_at)`, which PostgREST evaluates in UTC, so a
 * local-time month boundary would put the headline figure and the chart in
 * disagreement for a few hours around the start of every month.
 */

/** A row of the `deal_revenue_by_month` view. */
export type RevenueRow = {
  /** First day of the month, `YYYY-MM-DD`. */
  month: string;
  status: string;
  deals: number;
  value: number;
};

/** A row of the `deal_value_totals` view. */
export type StatusTotalRow = {
  status: string;
  deals: number;
  value: number;
  missing_value: number;
};

/** One point on the revenue trend. */
export type RevenuePoint = { month: string; label: string; value: number };

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

/** `YYYY-MM-DD` for the first day of the UTC month containing `at`. */
export function monthKey(at: Date): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** The UTC month `n` months before the one containing `at` (n may be 0). */
export function monthKeyBefore(at: Date, n: number): string {
  return monthKey(new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() - n, 1)));
}

/** ISO instant for the start of the UTC month containing `at`. */
export function monthStartIso(at: Date): string {
  return new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)
  ).toISOString();
}

/** Summed value of `status` rows, 0 when the status has no row. */
export function valueForStatus(
  rows: readonly StatusTotalRow[],
  status: string
): number {
  return rows.find((r) => r.status === status)?.value ?? 0;
}

/** Deal count for `status`, 0 when the status has no row. */
export function dealsForStatus(
  rows: readonly StatusTotalRow[],
  status: string
): number {
  return rows.find((r) => r.status === status)?.deals ?? 0;
}

/** Open deals carrying no value, which the pipeline total cannot include. */
export function missingValueCount(rows: readonly StatusTotalRow[]): number {
  return rows.find((r) => r.status === "open")?.missing_value ?? 0;
}

/** Won value in the UTC month containing `at`. */
export function wonInMonth(rows: readonly RevenueRow[], at: Date): number {
  const key = monthKey(at);
  return rows
    .filter((r) => r.status === "won" && r.month === key)
    .reduce((sum, r) => sum + r.value, 0);
}

/**
 * Percentage change from the previous month to the current one.
 *
 * `null` when the previous month is zero: every comparison against nothing is
 * either "infinite" or "0%", and neither tells the reader anything true. The
 * tile renders no chip at all rather than a made-up number.
 */
export function monthOverMonthDelta(
  rows: readonly RevenueRow[],
  at: Date
): number | null {
  const current = wonInMonth(rows, at);
  const prevKey = monthKeyBefore(at, 1);
  const previous = rows
    .filter((r) => r.status === "won" && r.month === prevKey)
    .reduce((sum, r) => sum + r.value, 0);

  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Won ÷ closed over the trailing `months` buckets, as a whole percentage.
 * Returns `null` when nothing closed — an empty win rate is unknown, not 0%.
 */
export function winRate(
  rows: readonly RevenueRow[],
  at: Date,
  months = 3
): number | null {
  const since = monthKeyBefore(at, months - 1);
  const recent = rows.filter((r) => r.month >= since);
  const won = recent
    .filter((r) => r.status === "won")
    .reduce((n, r) => n + r.deals, 0);
  const lost = recent
    .filter((r) => r.status === "lost")
    .reduce((n, r) => n + r.deals, 0);

  const closed = won + lost;
  if (closed === 0) return null;
  return Math.round((won / closed) * 100);
}

/**
 * Won value per month for the trailing `months`, oldest first.
 *
 * Months with no closed business are filled with 0 rather than skipped — a
 * gap-free axis is what makes a quiet month visible instead of invisible.
 */
export function revenueSeries(
  rows: readonly RevenueRow[],
  at: Date,
  months = 6
): RevenuePoint[] {
  const byMonth = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== "won") continue;
    byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + r.value);
  }

  const out: RevenuePoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const key = monthKeyBefore(at, i);
    out.push({
      month: key,
      // Parsed as UTC midnight, and formatted in UTC, so the label can't slip
      // to the previous month for readers behind Greenwich.
      label: MONTH_LABEL.format(new Date(`${key}T00:00:00Z`)),
      value: byMonth.get(key) ?? 0,
    });
  }
  return out;
}
