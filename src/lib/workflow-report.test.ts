import { describe, it, expect } from "vitest";
import {
  computeWorkflowReport,
  orderedActionNodes,
  type RunLite,
  type RunStepLite,
} from "./workflow-report";
import type { WorkflowGraph } from "./workflows";

const graph: WorkflowGraph = {
  nodes: [
    { id: "t", position: { x: 0, y: 0 }, data: { kind: "trigger", label: "Start" } },
    {
      id: "email",
      position: { x: 0, y: 1 },
      data: { kind: "action", action: "send_email", label: "Email" },
    },
    {
      id: "wait",
      position: { x: 0, y: 2 },
      data: { kind: "action", action: "wait", label: "Wait" },
    },
  ],
  edges: [
    { id: "e1", source: "t", target: "email" },
    { id: "e2", source: "email", target: "wait" },
  ],
};

const runs: RunLite[] = [
  { id: "r1", status: "active" },
  { id: "r2", status: "completed" },
  { id: "r3", status: "completed" },
  { id: "r4", status: "stopped" },
];

const steps: RunStepLite[] = [
  // email: 3 entered, 2 completed (30 min & 90 min → avg 60), 1 failed
  { run_id: "r1", node_id: "email", status: "completed", entered_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T00:30:00Z" },
  { run_id: "r2", node_id: "email", status: "completed", entered_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T01:30:00Z" },
  { run_id: "r3", node_id: "email", status: "failed", entered_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T00:00:00Z" },
  // wait: 1 entered, 0 completed — r1 is still sitting in it
  { run_id: "r1", node_id: "wait", status: "entered", entered_at: "2026-01-01T02:00:00Z", completed_at: null },
];

describe("orderedActionNodes", () => {
  it("orders action nodes by traversal from the trigger, excluding the trigger", () => {
    expect(orderedActionNodes(graph)).toEqual(["email", "wait"]);
  });
});

describe("computeWorkflowReport", () => {
  const report = computeWorkflowReport(graph, runs, steps);

  it("counts runs by status", () => {
    expect(report.runs.total).toBe(4);
    expect(report.runs.active).toBe(1);
    expect(report.runs.completed).toBe(2);
    expect(report.runs.stopped).toBe(1);
  });

  it("computes per-node entered/completed/failed + completion rate", () => {
    const email = report.nodes.find((n) => n.nodeId === "email")!;
    expect(email.entered).toBe(3);
    expect(email.completed).toBe(2);
    expect(email.failed).toBe(1);
    expect(email.completionRate).toBe(67); // 2/3
  });

  it("computes average time-in-step in minutes", () => {
    const email = report.nodes.find((n) => n.nodeId === "email")!;
    expect(email.avgMinutes).toBe(60); // (30 + 90) / 2
  });

  it("reports null avg when nothing completed", () => {
    const wait = report.nodes.find((n) => n.nodeId === "wait")!;
    expect(wait.entered).toBe(1);
    expect(wait.completed).toBe(0);
    expect(wait.avgMinutes).toBeNull();
  });
});

describe("workflowFlow", () => {
  const flow = computeWorkflowReport(graph, runs, steps).flow;
  const ribbon = (from: string, to: string) =>
    flow.links.find((l) => l.sourceName === from && l.targetName === to);

  it("routes every run from Enrolled to exactly one outcome", () => {
    const fromEnrolled = flow.links
      .filter((l) => l.sourceName === "Enrolled")
      .reduce((sum, l) => sum + l.value, 0);
    const outcomes = ["Completed", "Still in flight", "Exited early", "Failed"];
    const intoOutcomes = flow.links
      .filter((l) => outcomes.includes(l.targetName))
      .reduce((sum, l) => sum + l.value, 0);
    expect(fromEnrolled).toBe(runs.length);
    expect(intoOutcomes).toBe(runs.length);
  });

  it("counts the hops runs actually took", () => {
    // r1, r2 and r3 all started on the email; only r1 went on to the wait.
    expect(ribbon("Enrolled", "Email")?.value).toBe(3);
    expect(ribbon("Email", "Wait")?.value).toBe(1);
    expect(ribbon("Wait", "Still in flight")?.value).toBe(1);
    // r4 never got a step recorded, so it leaves from Enrolled.
    expect(ribbon("Enrolled", "Exited early")?.value).toBe(1);
  });

  it("ends a run by its own status, not by its last step's", () => {
    // r3's email step failed, but the engine carries on past a failed step and
    // r3's run finished — so it lands in Completed, and no ribbon claims a
    // failed *run* that never happened.
    expect(ribbon("Email", "Completed")?.value).toBe(2);
    expect(ribbon("Email", "Failed")).toBeUndefined();
  });

  it("sends a run with no recorded step straight to its outcome", () => {
    const only = computeWorkflowReport(
      graph,
      [{ id: "solo", status: "stopped" }],
      []
    ).flow;
    expect(only.links).toHaveLength(1);
    expect(only.links[0].sourceName).toBe("Enrolled");
    expect(only.links[0].targetName).toBe("Exited early");
  });

  it("keeps a step the graph no longer has", () => {
    const flow = computeWorkflowReport(
      graph,
      [{ id: "r", status: "completed" }],
      [
        {
          run_id: "r",
          node_id: "removed",
          status: "completed",
          entered_at: "2026-01-01T00:00:00Z",
          completed_at: "2026-01-01T00:01:00Z",
        },
      ]
    ).flow;
    expect(flow.nodes.map((n) => n.name)).toContain("Deleted step");
  });

  it("draws nothing when there are no runs", () => {
    expect(computeWorkflowReport(graph, [], []).flow.links).toEqual([]);
  });
});
