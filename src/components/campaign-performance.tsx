import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FunnelStageBars } from "@/components/funnel-view";
import { computeFunnel, pct } from "@/lib/funnel";

type Funnel = ReturnType<typeof computeFunnel>;

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

/**
 * The campaign funnel report — headline stats, delivery-issue badges, and the
 * per-step funnel breakdown. Presentational: callers compute the funnel (via
 * `computeFunnel`) and the enrolled count and pass them in, so this renders the
 * same way whether embedded in the campaign detail page or the reports page.
 */
export function CampaignPerformance({
  funnel,
  enrolled,
}: {
  funnel: Funnel;
  enrolled: number;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Enrolled" value={enrolled} />
        <Stat label="Sent (unique)" value={funnel.totals.sent} />
        <Stat
          label="Open rate"
          value={`${pct(funnel.totals.opened, funnel.totals.sent)}%`}
        />
        <Stat
          label="Reply rate"
          value={`${pct(funnel.totals.replied, funnel.totals.sent)}%`}
        />
      </div>

      {(funnel.bounced > 0 || funnel.unsubscribed > 0 || funnel.failed > 0) && (
        <div className="flex flex-wrap gap-2">
          {funnel.bounced > 0 && (
            <Badge variant="destructive">{funnel.bounced} bounced</Badge>
          )}
          {funnel.unsubscribed > 0 && (
            <Badge variant="warning">{funnel.unsubscribed} unsubscribed</Badge>
          )}
          {funnel.failed > 0 && (
            <Badge variant="secondary">{funnel.failed} failed</Badge>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-step funnel</CardTitle>
          <CardDescription>
            Distinct contacts reaching each stage, per step.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {funnel.steps.length ? (
            funnel.steps.map((s, i) => {
              const prev = i > 0 ? funnel.steps[i - 1] : null;
              const advanced = prev
                ? pct(s.stages.sent, prev.stages.sent)
                : null;
              return (
                <div key={s.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      Step {i + 1}
                      {s.subject ? (
                        <span className="text-muted-foreground"> · {s.subject}</span>
                      ) : null}
                    </p>
                    {advanced !== null && (
                      <span className="text-xs text-muted-foreground">
                        {advanced}% of step {i} advanced here
                      </span>
                    )}
                  </div>
                  <FunnelStageBars stages={s.stages} />
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">
              No steps to report on.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
