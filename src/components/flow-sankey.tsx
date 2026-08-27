"use client";

import { useEffect, useState } from "react";
import { Sankey, Tooltip } from "recharts";
import type { SankeyLinkProps, SankeyNodeProps } from "recharts";
import { pct } from "@/lib/funnel";
import {
  FLOW_TONES,
  TONE_LABELS,
  hasFlow,
  type Flow,
  type FlowNode,
  type FlowTone,
} from "@/lib/sankey";
import { cn } from "@/lib/utils";

const TONE_VAR: Record<FlowTone, string> = {
  flow: "var(--flow-move)",
  goal: "var(--flow-goal)",
  drop: "var(--flow-drop)",
  fail: "var(--flow-fail)",
};

const NODE_WIDTH = 10;
const LABEL_HEIGHT = 20;
/** Room above each node for its label, and so the gap between stacked nodes. */
const NODE_PADDING = 30;
/** Left/top/bottom only — the right margin is the label gutter, sized per flow. */
const GUTTER = { left: 6, bottom: 6 };
/**
 * recharts offsets node coordinates by the margin, so the top margin is the
 * headroom the first row's label sits in: it has to clear the label itself.
 */
const MARGIN_TOP = LABEL_HEIGHT + 6;
/** Narrower than this per column and the labels stop being readable. */
const MIN_COLUMN = 120;

/**
 * A flow report: where a cohort goes, and where it stops going.
 *
 * Ribbon width is a number of contacts on one scale across every column, so a
 * drop-off you can see is a drop-off that matters. The four colours are meanings
 * rather than series (see `--flow-*` in globals.css) and each is named in the
 * legend and again in the table below, so the chart is never the only way to
 * read a figure.
 *
 * Presentational — callers build the `Flow` (`campaignFlow`, `workflowFlow`) on
 * the server and pass it in.
 */
export function FlowSankey({
  flow,
  empty,
  className,
}: {
  flow: Flow;
  /** What to say when there is nothing to draw yet. */
  empty: string;
  className?: string;
}) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const width = useWidth(box);

  if (!hasFlow(flow)) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>{empty}</p>
    );
  }

  // The busiest column sets the height: room for every node's label plus a band
  // of ribbon under it. Capped so a sprawling workflow can't push the rest of
  // the page off screen.
  const perColumn = new Map<number, number>();
  for (const n of flow.nodes) {
    perColumn.set(n.depth, (perColumn.get(n.depth) ?? 0) + 1);
  }
  const busiest = Math.max(...perColumn.values());
  // The cap stops a sprawling workflow pushing the page off screen, but it can't
  // win against geometry: recharts scales every band by
  // `(height - gaps) / columnTotal`, so a column holding more nodes than the cap
  // leaves room for would scale them negative. The floor is what that column
  // needs to stay drawable, and it beats the cap.
  const floor = (busiest - 1) * NODE_PADDING + busiest * 8;
  const plotHeight = Math.max(300, Math.min(560, busiest * 62), floor);
  const height = plotHeight + MARGIN_TOP + GUTTER.bottom;

  // Labels are left-aligned at their own node and reach up to a column to the
  // right, so the last column needs a full column of gutter after it. (Turning
  // that one column's labels around to point left instead just moves the
  // collision onto its neighbour's.) The arithmetic lines up exactly: recharts
  // spaces columns by `(chartWidth - left - right - nodeWidth) / maxDepth`,
  // which with this gutter is the `columnWidth` below.
  const columns = flow.maxDepth + 1;
  const chartWidth = Math.max(columns * MIN_COLUMN, width);
  const columnWidth = (chartWidth - GUTTER.left - NODE_WIDTH) / columns;
  const margin = { ...GUTTER, top: MARGIN_TOP, right: columnWidth };

  // The cohort every share is measured against: everything leaving column 0.
  const total = flow.links
    .filter((l) => flow.nodes[l.source]?.depth === 0)
    .reduce((sum, l) => sum + l.value, 0);

  return (
    <div className={cn("space-y-4", className)}>
      <FlowLegend flow={flow} />

      <div ref={setBox} className="-mx-2 overflow-x-auto px-2">
        <Sankey
          width={chartWidth}
          height={height}
          margin={margin}
          data={{ nodes: flow.nodes, links: flow.links }}
          nodeWidth={NODE_WIDTH}
          nodePadding={NODE_PADDING}
          // Columns stack in the order the flow lists its nodes: spine first, so
          // it sits on top and the exits hang beneath it.
          sort={false}
          verticalAlign="top"
          // 'left' keeps a drop-off in the column right after the step it left
          // from. 'justify' flings every dead end to the far right, which throws
          // away the one thing this chart exists to show.
          align="left"
          node={(props: SankeyNodeProps) => (
            <FlowNodeMark
              {...props}
              labelWidth={columnWidth - 12}
              total={total}
            />
          )}
          link={(props: SankeyLinkProps) => (
            <g className="group/link">
              {/* A ribbon carrying 2% of the cohort is honestly about 4px wide,
                  which is a mean thing to ask anyone to hover. This widens the
                  target without widening the mark. */}
              <path
                d={ribbon(props)}
                fill="none"
                stroke="transparent"
                strokeWidth={Math.max(10, props.linkWidth)}
              />
              <path
                d={ribbon(props)}
                fill="none"
                stroke={TONE_VAR[toneOf(props.payload)]}
                strokeWidth={Math.max(1, props.linkWidth)}
                className="[stroke-opacity:0.3] group-hover/link:[stroke-opacity:0.75]"
              />
            </g>
          )}
        >
          <Tooltip content={<FlowTooltip total={total} />} />
        </Sankey>
      </div>

      <FlowTable flow={flow} total={total} />
    </div>
  );
}

/** Element width, tracked so labels can be sized to the real column width. */
function useWidth(el: HTMLElement | null): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return width;
}

function toneOf(payload: unknown): FlowTone {
  const tone = (payload as { tone?: FlowTone } | undefined)?.tone;
  return tone && FLOW_TONES.includes(tone) ? tone : "flow";
}

/**
 * One ribbon, as a curve stroked at the link's own width — recharts hands over
 * the bezier control points, so this is the band a filled path would draw
 * without having to close it by hand.
 */
function ribbon({
  sourceX,
  sourceY,
  sourceControlX,
  targetX,
  targetY,
  targetControlX,
}: SankeyLinkProps): string {
  return `M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;
}

type NodeMarkProps = SankeyNodeProps & {
  labelWidth: number;
  total: number;
};

/**
 * The node bar and its label. The label sits *above* the bar rather than beside
 * it — beside would run it straight through the ribbons leaving for the next
 * column — and `NODE_PADDING` is set to clear a label's height, so the row above
 * always has room for the one below it.
 */
function FlowNodeMark({
  x,
  y,
  width,
  height,
  payload,
  labelWidth,
  total,
}: NodeMarkProps) {
  const node = payload as unknown as FlowNode & { value: number };

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={Math.max(2, height)}
        rx={2}
        fill={TONE_VAR[node.tone]}
      />
      <foreignObject
        x={x}
        y={Math.max(0, y - LABEL_HEIGHT - 1)}
        width={labelWidth}
        height={LABEL_HEIGHT}
      >
        <div
          className={cn(
            // The halo is the card surface doing the separating: a label sitting
            // in the gap between two stacked nodes crosses the ribbons
            // converging on them, and 11px text needs the surface to hold it
            // apart from them.
            "flex items-baseline gap-1.5 overflow-hidden text-[11px] leading-5",
            "[text-shadow:0_0_3px_var(--card),0_0_3px_var(--card),0_0_3px_var(--card)]"
          )}
        >
          <span className="truncate font-medium text-foreground">
            {node.name}
          </span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {node.value.toLocaleString()}
            {total > 0 && node.depth > 0
              ? ` · ${pct(node.value, total)}%`
              : ""}
          </span>
        </div>
      </foreignObject>
    </g>
  );
}

function FlowLegend({ flow }: { flow: Flow }) {
  const present = FLOW_TONES.filter((tone) =>
    flow.links.some((l) => l.tone === tone)
  );
  // One class is no legend: the card's own description already names it.
  if (present.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {present.map((tone) => (
        <li
          key={tone}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span
            aria-hidden
            className="size-2.5 rounded-[2px]"
            style={{ background: TONE_VAR[tone] }}
          />
          {TONE_LABELS[tone]}
        </li>
      ))}
    </ul>
  );
}

type HoveredItem = Partial<FlowNode> & {
  value?: number;
  sourceName?: string;
  targetName?: string;
};

function FlowTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: { payload?: unknown }[];
  total: number;
}) {
  const hovered = payload?.[0]?.payload as HoveredItem | undefined;
  if (!active || !hovered || typeof hovered.value !== "number") return null;

  const isRibbon = typeof hovered.sourceName === "string";
  return (
    <div className="max-w-64 rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <p className="text-xs text-muted-foreground">
        {isRibbon
          ? `${hovered.sourceName} → ${hovered.targetName}`
          : hovered.name}
      </p>
      <p className="text-sm font-medium tabular-nums">
        {hovered.value.toLocaleString()} contact
        {hovered.value === 1 ? "" : "s"}
        {total > 0 && (
          <span className="font-normal text-muted-foreground">
            {" · "}
            {pct(hovered.value, total)}% of the cohort
          </span>
        )}
      </p>
      {!isRibbon && hovered.hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hovered.hint}</p>
      ) : null}
    </div>
  );
}

/** The chart's readable twin — no value here is reachable only by hovering. */
function FlowTable({ flow, total }: { flow: Flow; total: number }) {
  return (
    <details>
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
        Show these figures as a table
      </summary>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="py-1.5 text-left font-medium">From</th>
            <th className="py-1.5 text-left font-medium">To</th>
            <th className="py-1.5 text-right font-medium">Contacts</th>
            <th className="py-1.5 text-right font-medium">Share</th>
          </tr>
        </thead>
        <tbody>
          {flow.links.map((l, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="py-1.5">{l.sourceName}</td>
              <td className="py-1.5">
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-[2px]"
                    style={{ background: TONE_VAR[l.tone] }}
                  />
                  {l.targetName}
                </span>
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {l.value.toLocaleString()}
              </td>
              <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                {pct(l.value, total)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
