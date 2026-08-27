import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { money, plural, statusLabel } from "@/lib/utils";
import { pct } from "@/lib/funnel";
import { loadBreakdowns, type StageRow } from "./queries";

/**
 * The supporting detail: where open business is sitting, how the contact book
 * is distributed, and whether outreach is landing.
 *
 * All of it renders on the server as CSS bars. Recharts is reserved for the one
 * genuine time series — seven rows that each need a label, a bar, a count *and*
 * a currency figure is a table with bars, not a chart, and drawing it with a
 * charting library would buy a client boundary and a JS payload for nothing.
 */
export async function Breakdowns() {
  const { stages, lifecycle, campaigns } = await loadBreakdowns();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Pipeline by stage" href="/pipeline">
        {stages.length ? (
          <StageBars rows={stages} />
        ) : (
          <Empty>
            No open deals. Stages are set up in{" "}
            <Link href="/settings/pipeline" className="underline">
              Settings
            </Link>
            .
          </Empty>
        )}
      </Panel>

      <Panel title="Outreach" href="/reports/campaigns">
        {campaigns.length ? (
          <ul className="space-y-3">
            {campaigns.map((c) => (
              <li key={c.id}>
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/reports/${c.id}`}
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {c.name}
                  </Link>
                  <Badge variant={c.replied > 0 ? "success" : "secondary"}>
                    {pct(c.replied, c.sent)}% replied
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {c.sent.toLocaleString()} sent ·{" "}
                  {c.replied.toLocaleString()} replied
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No active campaigns.</Empty>
        )}
      </Panel>

      <Panel title="Contacts by stage" href="/contacts" className="lg:col-span-2">
        {lifecycle.length ? (
          <div className="flex flex-wrap gap-2">
            {lifecycle.map((l) => (
              <span
                key={l.stage}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
              >
                <span className="font-medium">{statusLabel(l.stage)}</span>
                <span className="tabular-nums text-muted-foreground">
                  {l.contacts.toLocaleString()}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <Empty>No contacts yet.</Empty>
        )}
      </Panel>
    </div>
  );
}

/**
 * Open deals per stage, as proportional bars.
 *
 * Bars are scaled by **value**, not deal count — a stage holding one £80k deal
 * matters more than one holding six £500 deals, and scaling by count would say
 * the opposite. Falls back to count when nothing carries a value at all.
 */
function StageBars({ rows }: { rows: StageRow[] }) {
  const byValue = rows.some((r) => r.value > 0);
  const base = Math.max(
    ...rows.map((r) => (byValue ? r.value : r.deals)),
    1
  );

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const n = byValue ? r.value : r.deals;
        return (
          <div key={r.stageId} className="flex items-center gap-3">
            <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">
              {r.stage}
            </span>
            <div className="h-6 flex-1 overflow-hidden rounded bg-muted">
              <div
                className="h-full bg-[var(--chart-1)] transition-all"
                style={{ width: `${Math.round((n / base) * 100)}%` }}
              />
            </div>
            <span className="w-28 shrink-0 text-right text-xs tabular-nums">
              <span className="font-medium text-foreground">
                {money(r.value, "—")}
              </span>
              <span className="ml-1 text-muted-foreground">
                {r.deals} {plural("deal", r.deals)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Panel({
  title,
  href,
  children,
  className,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`p-4 ${className ?? ""}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <Link
          href={href}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          View all
        </Link>
      </div>
      {children}
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-sm text-muted-foreground">{children}</p>;
}
