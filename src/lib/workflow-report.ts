// Pure workflow-report aggregation over workflow_runs + workflow_run_steps.
// Runs-by-status, per-node entered/completed/failed, completion rate, and
// average time-in-step — ordered by graph traversal. No I/O — testable.

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

export type RunLite = { status: string };
export type RunStepLite = {
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

  return { runs: runCounts, nodes };
}
