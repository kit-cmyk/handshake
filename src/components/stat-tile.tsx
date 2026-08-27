import Link from "next/link";
import { ArrowUpRight, ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The app's single headline-number tile.
 *
 * Three separate implementations of this had grown up — the dashboard's own
 * inline cards, a private `Stat` in campaign-performance, and another in the
 * leads header — which is why the same figure rendered at three different sizes
 * depending on which page you were on. This is the one.
 *
 * Pass `to` to make the whole tile a link; a number that can't be drilled into
 * is usually a number nobody trusts.
 */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  delta,
  to,
  className,
}: {
  label: string;
  /** Pre-formatted. Run counts through `toLocaleString()` and money through `money()`. */
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  /** Percentage change against the previous period. Omit when there's nothing to compare. */
  delta?: number | null;
  /** Where the tile drills into. */
  to?: string;
  className?: string;
}) {
  const body = (
    <Card
      className={cn(
        "relative h-full overflow-hidden p-4",
        to && "transition-colors hover:border-primary/40",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <Icon className="size-4 shrink-0 text-muted-foreground" />
        ) : null}
      </div>

      <p className="mt-2 font-heading text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>

      <div className="mt-1 flex items-center gap-2">
        <DeltaBadge delta={delta} />
        {hint ? (
          <p className="truncate text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>

      {to ? (
        <ArrowUpRight className="absolute right-3 top-3 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      ) : null}
    </Card>
  );

  return to ? (
    <Link href={to} className="group block">
      {body}
    </Link>
  ) : (
    body
  );
}

/**
 * Period-on-period change. Rendered only when there is a real comparison to
 * make — a delta against a month with no activity is noise, not information, so
 * callers pass `null` rather than an infinite percentage.
 */
function DeltaBadge({ delta }: { delta?: number | null }) {
  if (delta == null || !Number.isFinite(delta)) return null;

  const rounded = Math.round(delta);
  if (rounded === 0)
    return <span className="text-xs text-muted-foreground">no change</span>;

  const up = rounded > 0;
  const Arrow = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        up
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-destructive"
      )}
    >
      <Arrow className="size-3" />
      {Math.abs(rounded)}%
    </span>
  );
}
