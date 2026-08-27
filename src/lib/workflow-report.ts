// Pure workflow-report aggregation over workflow_runs + workflow_run_steps.
// Runs-by-status, per-node entered/completed/failed, completion rate, average
// time-in-step — ordered by graph traversal — and the run-path flow the Sankey
// report draws. No I/O — testable.

import {
  buildFlow,
  EMPTY_FLOW,
  type Flow,
  type FlowLinkSpec,
  type FlowNodeSpec,
} from "./sankey";
import {
  findTriggerNode,
  outgoing,
  getNode,
  type WorkflowGraph,
} from "./workflows";

export const RUN_STATUSES = [
  "active",
  "completed",
  "failed",
  "stopped",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export type RunLite = { id: string; status: string };
export type RunStepLite = {
  run_id: string;
  node_id: string;
  status: string;
  entered_at: string;
  completed_at: string | null;
};

export type NodeReport = {
  nodeId: string;
  label: string;
  action?: string;
  entered: number;
  completed: number;
  failed: number;
  completionRate: number;
  avgMinutes: number | null;
};

export type WorkflowReport = {
  runs: Record<RunStatus, number> & { total: number };
  nodes: NodeReport[];
  /** Contacts' actual routes through the graph, for the Sankey. */
  flow: Flow;
};

/** Action nodes in execution order: BFS from the trigger, then any leftovers. */
export function orderedActionNodes(graph: WorkflowGraph): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const trigger = findTriggerNode(graph);
  const queue: string[] = trigger ? [trigger.id] : [];
  if (trigger) seen.add(trigger.id);

  while (queue.length) {
    const id = queue.shift()!;
    const node = getNode(graph, id);
    if (node && node.data?.kind === "action") order.push(id);
    for (const e of outgoing(graph, id)) {
      if (!seen.has(e.target)) {
        seen.add(e.target);
        queue.push(e.target);
      }
    }
  }
  // Append any action nodes not reachable from the trigger.
  for (const n of graph.nodes) {
    if (n.data?.kind === "action" && !seen.has(n.id)) order.push(n.id);
  }
  return order;
}

function pctRate(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

export function computeWorkflowReport(
  graph: WorkflowGraph,
  runs: RunLite[],
  steps: RunStepLite[]
): WorkflowReport {
  const runCounts = {
    active: 0,
    completed: 0,
    failed: 0,
    stopped: 0,
    total: runs.length,
  } as Record<RunStatus, number> & { total: number };
  for (const r of runs) {
    if ((RUN_STATUSES as readonly string[]).includes(r.status)) {
      runCounts[r.status as RunStatus]++;
    }
  }

  // Group steps by node.
  const byNode = new Map<string, RunStepLite[]>();
  for (const s of steps) {
    (byNode.get(s.node_id) ?? byNode.set(s.node_id, []).get(s.node_id)!).push(s);
  }

  const nodes: NodeReport[] = orderedActionNodes(graph).map((nodeId) => {
    const node = getNode(graph, nodeId);
    const rows = byNode.get(nodeId) ?? [];
    const entered = rows.length;
    const completed = rows.filter((r) => r.status === "completed").length;
    const failed = rows.filter((r) => r.status === "failed").length;

    // Average time-in-step over successfully completed steps only.
    let totalMs = 0;
    let timed = 0;
    for (const r of rows) {
      if (r.status === "completed" && r.completed_at) {
        const dt = Date.parse(r.completed_at) - Date.parse(r.entered_at);
        if (Number.isFinite(dt) && dt >= 0) {
          totalMs += dt;
          timed++;
        }
      }
    }

    return {
      nodeId,
      label: (node?.data?.label as string) ?? nodeId,
      action: node?.data?.action,
      entered,
      completed,
      failed,
      completionRate: pctRate(completed, entered),
      avgMinutes: timed > 0 ? Math.round(totalMs / timed / 60000) : null,
    };
  });

  return {
    runs: runCounts,
    nodes,
    flow: workflowFlow(graph, nodes, runs, steps),
  };
}

// ---- Run-path flow (Sankey) -------------------------------------------------

/**
 * Where a run ended up. `stopped` covers both halves of the exit config — a
 * contact who hit the goal stage and one who matched a "stop nagging them" rule
 * leave by the same door — so it reads as neutral rather than good or bad.
 */
const OUTCOMES = [
  { id: "outcome:completed", label: "Completed", tone: "goal" },
  { id: "outcome:active", label: "Still in flight", tone: "flow" },
  { id: "outcome:stopped", label: "Exited early", tone: "drop" },
  { id: "outcome:failed", label: "Failed", tone: "fail" },
] as const satisfies readonly FlowNodeSpec[];

const OUTCOME_HINTS: Record<string, string> = {
  "outcome:completed": "Reached the end of the flow.",
  "outcome:active": "Mid-run right now — waiting on a delay or the next step.",
  "outcome:stopped": "Met an exit rule: replied, hit the goal stage, or matched an exit condition.",
  "outcome:failed": "The run errored out and stopped short.",
};

function outcomeId(status: string): string {
  // Anything outside the four known statuses is a run that is no longer going
  // anywhere, so it lands with the other early exits rather than vanishing.
  return (RUN_STATUSES as readonly string[]).includes(status)
    ? `outcome:${status}`
    : "outcome:stopped";
}

/**
 * Contacts' real routes through the workflow, reconstructed from step rows.
 *
 * This doesn't infer flow from the graph's edges — it reads each run's steps in
 * the order they were entered and counts the hops that actually happened, so a
 * branch shows the split it really produced rather than the one it was wired
 * for. Every run contributes exactly one path from `Enrolled` to one outcome,
 * including a run that never got a step recorded (enrolled, then the workflow
 * was paused or an exit rule fired straight away).
 */
export function workflowFlow(
  graph: WorkflowGraph,
  nodes: readonly NodeReport[],
  runs: readonly RunLite[],
  steps: readonly RunStepLite[]
): Flow {
  if (!runs.length) return EMPTY_FLOW;

  const byRun = new Map<string, RunStepLite[]>();
  for (const s of steps) {
    const bucket = byRun.get(s.run_id);
    if (bucket) bucket.push(s);
    else byRun.set(s.run_id, [s]);
  }
  // Entry order is already chronological (rows are read ordered by id); sorting
  // on entered_at refines that without disturbing ties, which a run can produce
  // when several steps are recorded inside the same second.
  for (const path of byRun.values()) {
    path.sort((a, b) => Date.parse(a.entered_at) - Date.parse(b.entered_at));
  }

  // source id -> target id -> contacts. Nested rather than a joined string key:
  // node ids come off the canvas and are not ours to pick a delimiter against.
  const hops = new Map<string, Map<string, number>>();
  const bump = (source: string, target: string) => {
    let targets = hops.get(source);
    if (!targets) hops.set(source, (targets = new Map()));
    targets.set(target, (targets.get(target) ?? 0) + 1);
  };

  const seenNodeIds = new Set<string>();
  for (const run of runs) {
    const path = byRun.get(run.id) ?? [];
    const end = outcomeId(run.status);
    if (!path.length) {
      bump("enrolled", end);
      continue;
    }
    bump("enrolled", `node:${path[0].node_id}`);
    seenNodeIds.add(path[0].node_id);
    for (let i = 1; i < path.length; i++) {
      seenNodeIds.add(path[i].node_id);
      bump(`node:${path[i - 1].node_id}`, `node:${path[i].node_id}`);
    }
    bump(`node:${path[path.length - 1].node_id}`, end);
  }

  const flowNodes: FlowNodeSpec[] = [
    { id: "enrolled", label: "Enrolled", tone: "flow" },
  ];
  // Graph order first so the spine reads left-to-right in execution order, then
  // any node ids the runs remember but the graph no longer has — a step deleted
  // from the builder still happened, and dropping it would lose the contacts
  // that went through it.
  const reported = new Map(nodes.map((n) => [n.nodeId, n]));
  const listed = new Set<string>();
  const pushNode = (nodeId: string) => {
    if (listed.has(nodeId)) return;
    listed.add(nodeId);
    const report = reported.get(nodeId);
    const label = report?.label ?? getNode(graph, nodeId)?.data?.label;
    const failed = report?.failed ?? 0;
    flowNodes.push({
      id: `node:${nodeId}`,
      label: label ?? "Deleted step",
      tone: failed > 0 ? "fail" : "flow",
      hint: label
        ? failed > 0
          ? `${failed} contact${failed === 1 ? "" : "s"} errored here`
          : undefined
        : "No longer in the workflow, but contacts ran through it.",
    });
  };
  for (const n of nodes) pushNode(n.nodeId);
  for (const nodeId of seenNodeIds) pushNode(nodeId);

  for (const outcome of OUTCOMES) {
    flowNodes.push({ ...outcome, hint: OUTCOME_HINTS[outcome.id] });
  }

  const links: FlowLinkSpec[] = [];
  for (const [source, targets] of hops) {
    for (const [target, value] of targets) {
      // A ribbon takes its meaning from where it lands: anything short of an
      // outcome is a contact still on the move.
      const outcome = OUTCOMES.find((o) => o.id === target);
      links.push({ source, target, value, tone: outcome?.tone ?? "flow" });
    }
  }

  return buildFlow(flowNodes, links);
}
