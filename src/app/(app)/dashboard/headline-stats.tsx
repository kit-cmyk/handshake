import { Banknote, TrendingUp, Trophy, UserPlus } from "lucide-react";
import { StatTile } from "@/components/stat-tile";
import { money, plural } from "@/lib/utils";
import { loadHeadline } from "./queries";
import {
  dealsForStatus,
  missingValueCount,
  monthOverMonthDelta,
  valueForStatus,
  winRate,
  wonInMonth,
} from "./metrics";

/**
 * The money strip: what came in, what's still out there, how often it lands,
 * and whether the top of the funnel is still being fed.
 *
 * Every tile links to the page that explains it — a number you can't drill into
 * is a number nobody ends up trusting.
 */
export async function HeadlineStats({ now }: { now: Date }) {
  const { statusTotals, revenue, newContacts, hasMetrics } =
    await loadHeadline(now);

  // Migration 0043 hasn't been applied yet: show nothing rather than four
  // confident zeros, which would read as "you have no business".
  if (!hasMetrics) return null;

  const won = wonInMonth(revenue, now);
  const wonDeals = revenue
    .filter((r) => r.status === "won" && r.month === revenue.at(-1)?.month)
    .reduce((n, r) => n + r.deals, 0);
  const openValue = valueForStatus(statusTotals, "open");
  const openDeals = dealsForStatus(statusTotals, "open");
  const unvalued = missingValueCount(statusTotals);
  const rate = winRate(revenue, now);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        label="Won this month"
        value={money(won, "$0")}
        hint={wonDeals ? `${wonDeals} ${plural("deal", wonDeals)}` : "No wins yet"}
        icon={Banknote}
        delta={monthOverMonthDelta(revenue, now)}
        to="/pipeline"
      />
      <StatTile
        label="Open pipeline"
        value={money(openValue, "$0")}
        // A total is only honest next to the deals it couldn't include.
        hint={
          unvalued > 0
            ? `${openDeals} open · ${unvalued} unvalued`
            : `${openDeals} open ${plural("deal", openDeals)}`
        }
        icon={TrendingUp}
        to="/pipeline"
      />
      <StatTile
        label="Win rate"
        value={rate == null ? "—" : `${rate}%`}
        hint={rate == null ? "Nothing closed yet" : "Last 3 months"}
        icon={Trophy}
        to="/reports"
      />
      <StatTile
        label="New contacts"
        value={newContacts}
        hint="This month"
        icon={UserPlus}
        to="/contacts"
      />
    </div>
  );
}
