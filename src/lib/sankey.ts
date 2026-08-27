// Flow-graph shaping for the Sankey reports.
//
// Domain code (campaign funnels, workflow runs) describes a flow as id-keyed
// nodes and links; `buildFlow` turns that into the *index*-keyed shape recharts'
// <Sankey> expects, drops links carrying nobody, and computes the column depth
// of every node so the renderer knows which labels sit in the final column.
//
// No I/O and no React — testable.

/**
 * What a ribbon means, not which series it is. Four classes, each of which is
 * also spelled out in the legend and on the node labels, so the reading never
 * rests on colour alone:
 *
 * - `flow` — still moving forward through the sequence
 * - `goal` — reached the outcome the campaign/workflow exists for
 * - `drop` — left without reaching it
 * - `fail` — a delivery or execution failure, not a choice the contact made
 */
export const FLOW_TONES = ["flow", "goal", "drop", "fail"] as const;
export type FlowTone = (typeof FLOW_TONES)[number];

export const TONE_LABELS: Record<FlowTone, string> = {
  flow: "Moving forward",
  goal: "Goal reached",
  drop: "Dropped off",
  fail: "Failed",
};

/** A node as the domain describes it. */
export type FlowNodeSpec = {
  id: string;
  label: string;
  tone: FlowTone;
  /** Secondary line for the tooltip, e.g. "opened 40 · clicked 12". */
  hint?: string;
};

/** A ribbon as the domain describes it. */
export type FlowLinkSpec = {
  source: string;
  target: string;
  value: number;
  tone: FlowTone;
};

/**
 * A node in the built flow. `name` is what recharts reads for the tooltip;
 * `depth` is the node's column. recharts overwrites `value` and `depth` with its
 * own layout figures — they agree with ours for a DAG, which is all we emit.
 */
export type FlowNode = {
  name: string;
  tone: FlowTone;
  hint?: string;
  depth: number;
};

/** A ribbon in the built flow, with endpoints resolved to node indices. */
export type FlowLink = {
  source: number;
  target: number;
  value: number;
  tone: FlowTone;
  sourceName: string;
  targetName: string;
};

export type Flow = {
  nodes: FlowNode[];
  links: FlowLink[];
  /** Index of the last column. 0 when there is nothing to draw. */
  maxDepth: number;
  /**
   * Links removed because they pointed backwards into a cycle. Always 0 for the
   * flows this app builds; the guard exists because recharts' depth pass
   * recurses until depth stops growing, so one cyclic link would hang it.
   */
  droppedLinks: number;
};

export const EMPTY_FLOW: Flow = {
  nodes: [],
  links: [],
  maxDepth: 0,
  droppedLinks: 0,
};

/** True when there is enough in the flow to draw a chart from. */
export function hasFlow(flow: Flow): boolean {
  return flow.links.length > 0;
}

const WHITE = 0,
  GRAY = 1,
  BLACK = 2;

/**
 * Depth-first removal of back-edges. Each node is visited once, so each link is
 * examined once: a link into a node still on the stack (GRAY) closes a cycle and
 * is dropped; everything else is kept.
 */
function removeBackEdges(
  ids: string[],
  links: FlowLinkSpec[]
): { kept: FlowLinkSpec[]; dropped: number } {
  const out = new Map<string, FlowLinkSpec[]>();
  for (const l of links) {
    const bucket = out.get(l.source);
    if (bucket) bucket.push(l);
    else out.set(l.source, [l]);
  }

  const state = new Map<string, number>();
  const kept: FlowLinkSpec[] = [];
  let dropped = 0;

  // Iterative DFS so a long chain can't blow the stack.
  for (const start of ids) {
    if ((state.get(start) ?? WHITE) !== WHITE) continue;
    const stack: { id: string; edges: FlowLinkSpec[]; i: number }[] = [
      { id: start, edges: out.get(start) ?? [], i: 0 },
    ];
    state.set(start, GRAY);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (frame.i >= frame.edges.length) {
        state.set(frame.id, BLACK);
        stack.pop();
        continue;
      }
      const link = frame.edges[frame.i++];
      const target = link.target;
      if ((state.get(target) ?? WHITE) === GRAY) {
        dropped++;
        continue;
      }
      kept.push(link);
      if ((state.get(target) ?? WHITE) === WHITE) {
        state.set(target, GRAY);
        stack.push({ id: target, edges: out.get(target) ?? [], i: 0 });
      }
    }
  }

  return { kept, dropped };
}

/** Longest-path depth per node over a DAG, by topological order. */
function depths(ids: string[], links: FlowLinkSpec[]): Map<string, number> {
  const depth = new Map<string, number>(ids.map((id) => [id, 0]));
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]));
  const out = new Map<string, FlowLinkSpec[]>();
  for (const l of links) {
    indegree.set(l.target, (indegree.get(l.target) ?? 0) + 1);
    const bucket = out.get(l.source);
    if (bucket) bucket.push(l);
    else out.set(l.source, [l]);
  }

  const queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0);
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    for (const l of out.get(id) ?? []) {
      const candidate = (depth.get(id) ?? 0) + 1;
      if (candidate > (depth.get(l.target) ?? 0)) depth.set(l.target, candidate);
      const left = (indegree.get(l.target) ?? 0) - 1;
      indegree.set(l.target, left);
      if (left === 0) queue.push(l.target);
    }
  }
  return depth;
}

/**
 * Assemble a drawable flow. Links carrying nobody are dropped, and so are nodes
 * left with no ribbon at all — a funnel stage nobody reached is noise on the
 * chart, and the numbers behind it are still in the table view.
 *
 * Node order is preserved, and the renderer draws columns top-down in that
 * order, so callers control the layout by listing the spine before its
 * branch-offs.
 */
export function buildFlow(
  nodes: readonly FlowNodeSpec[],
  links: readonly FlowLinkSpec[]
): Flow {
  const known = new Set(nodes.map((n) => n.id));

  const usable: FlowLinkSpec[] = [];
  for (const l of links) {
    const value = Math.round(l.value);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (l.source === l.target) continue;
    if (!known.has(l.source) || !known.has(l.target)) continue;
    usable.push({ ...l, value });
  }

  const ids = nodes.map((n) => n.id);
  const { kept, dropped } = removeBackEdges(ids, usable);
  if (!kept.length) return { ...EMPTY_FLOW, droppedLinks: dropped };

  const touched = new Set<string>();
  for (const l of kept) {
    touched.add(l.source);
    touched.add(l.target);
  }

  const live = nodes.filter((n) => touched.has(n.id));
  const depth = depths(
    live.map((n) => n.id),
    kept
  );
  const indexOf = new Map(live.map((n, i) => [n.id, i]));
  const labelOf = new Map(live.map((n) => [n.id, n.label]));

  return {
    nodes: live.map((n) => ({
      name: n.label,
      tone: n.tone,
      hint: n.hint,
      depth: depth.get(n.id) ?? 0,
    })),
    links: kept.map((l) => ({
      source: indexOf.get(l.source)!,
      target: indexOf.get(l.target)!,
      value: l.value,
      tone: l.tone,
      sourceName: labelOf.get(l.source)!,
      targetName: labelOf.get(l.target)!,
    })),
    maxDepth: Math.max(0, ...live.map((n) => depth.get(n.id) ?? 0)),
    droppedLinks: dropped,
  };
}
