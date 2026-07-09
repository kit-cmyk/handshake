import {
  FUNNEL_STAGES,
  STAGE_LABELS,
  pct,
  type FunnelStage,
} from "@/lib/funnel";

// Sequential single-hue ramp so the funnel reads as one series (light + dark).
const BAR: Record<FunnelStage, string> = {
  sent: "bg-sky-500",
  opened: "bg-sky-500/85",
  clicked: "bg-sky-500/70",
  replied: "bg-emerald-500",
  booked: "bg-emerald-600",
};

export function FunnelStageBars({
  stages,
}: {
  stages: Record<FunnelStage, number>;
}) {
  const base = stages.sent || Math.max(...Object.values(stages), 1);
  return (
    <div className="space-y-2">
      {FUNNEL_STAGES.map((stage) => {
        const n = stages[stage];
        const width = base > 0 ? Math.round((n / base) * 100) : 0;
        return (
          <div key={stage} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">
              {STAGE_LABELS[stage]}
            </span>
            <div className="h-6 flex-1 overflow-hidden rounded bg-muted">
              <div
                className={`h-full ${BAR[stage]} transition-all`}
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="w-24 shrink-0 text-right text-xs tabular-nums">
              <span className="font-medium text-foreground">{n}</span>
              <span className="text-muted-foreground">
                {" "}
                ({pct(n, stages.sent)}%)
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
