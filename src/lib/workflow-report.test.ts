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

describe("orderedActionNodes", () => {
  it("orders action nodes by traversal from the trigger, excluding the trigger", () => {
    expect(orderedActionNodes(graph)).toEqual(["email", "wait"]);
  });
});

describe("computeWorkflowReport", () => {
  const runs: RunLite[] = [
    { status: "active" },
    { status: "completed" },
    { status: "completed" },
    { status: "stopped" },
  ];

  const steps: RunStepLite[] = [
    // email: 3 entered, 2 completed (30 min & 90 min → avg 60), 1 failed
    { node_id: "email", status: "completed", entered_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T00:30:00Z" },
    { node_id: "email", status: "completed", entered_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T01:30:00Z" },
    { node_id: "email", status: "failed", entered_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T00:00:00Z" },
    // wait: 1 entered, 0 completed
    { node_id: "wait", status: "entered", entered_at: "2026-01-01T02:00:00Z", completed_at: null },
  ];

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
