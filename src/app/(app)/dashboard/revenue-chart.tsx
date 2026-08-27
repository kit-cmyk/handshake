"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money } from "@/lib/utils";
import type { RevenuePoint } from "./metrics";

/**
 * Won revenue by month — the only chart on the dashboard, and the only client
 * component on the page.
 *
 * A single series on purpose. `--chart-1` through `--chart-5` are five tints of
 * one blue hue, which is right for a sequential ramp and unreadable as
 * categories: chart-1 and chart-2 are near-indistinguishable side by side. So
 * won-vs-lost is not drawn here; the win-rate tile carries that instead.
 */
export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  // Nothing closed in any of the months we asked for. An axis of zeroes reads
  // as a broken chart, so say what's actually true instead.
  if (data.every((d) => d.value === 0)) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No closed-won deals yet. Move a deal to Won and this fills in.
      </div>
    );
  }

  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
        >
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--chart-1)"
                stopOpacity={0.35}
              />
              <stop
                offset="100%"
                stopColor="var(--chart-1)"
                stopOpacity={0.02}
              />
            </linearGradient>
          </defs>

          {/* Horizontal rules only: vertical ones add clutter without helping
              anyone read a six-point series. */}
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            dy={4}
          />
          <YAxis
            width={56}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickFormatter={(v: number) => compact(v)}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            content={<RevenueTooltip />}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#revenueFill)"
            // The dot only appears on hover; six permanent dots on a smooth
            // line is noise.
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: "var(--chart-1)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Axis labels need to fit; "$42k" beats "$42,500" in 56 pixels. */
function compact(v: number): string {
  if (v === 0) return "$0";
  if (Math.abs(v) >= 1000) return `$${Math.round(v / 1000)}k`;
  return `$${Math.round(v)}`;
}

type TooltipProps = {
  active?: boolean;
  payload?: { payload: RevenuePoint }[];
};

function RevenueTooltip({ active, payload }: TooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <p className="text-xs text-muted-foreground">{point.label}</p>
      <p className="text-sm font-medium tabular-nums">
        {money(point.value, "$0")}
      </p>
    </div>
  );
}
