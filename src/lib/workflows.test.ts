import { describe, it, expect } from "vitest";
import {
  findTriggerNode,
  nextNodeId,
  evaluateBranch,
  parseGraph,
  parseExitConfig,
  hasExitCriteria,
  describeExit,
  validateGraph,
  autoLayout,
  actionConfigErrors,
  triggerConfigErrors,
  describeAction,
  describeTrigger,
  formatMinutes,
  isTerminalAction,
  type WorkflowGraph,
  type WFNode,
} from "./workflows";
import type { EvaluableContact } from "./segments";

const g: WorkflowGraph = {
  nodes: [
    { id: "t", position: { x: 0, y: 0 }, data: { kind: "trigger", label: "Start" } },
    {
      id: "a1",
      position: { x: 0, y: 1 },
      data: { kind: "action", action: "send_email", label: "Email" },
    },
    {
      id: "b",
      position: { x: 0, y: 2 },
      data: {
        kind: "action",
        action: "branch",
        label: "Branch",
        config: { field: "lifecycle_stage", op: "equals", value: "qualified" },
      },
    },
    { id: "yes", position: { x: 1, y: 3 }, data: { kind: "action", action: "wait", label: "Yes" } },
    { id: "no", position: { x: -1, y: 3 }, data: { kind: "action", action: "wait", label: "No" } },
  ],
  edges: [
    { id: "e1", source: "t", target: "a1" },
    { id: "e2", source: "a1", target: "b" },
    { id: "e3", source: "b", target: "yes", sourceHandle: "true" },
    { id: "e4", source: "b", target: "no", sourceHandle: "false" },
  ],
};

const contact = (stage: string): EvaluableContact => ({
  id: "c1",
  email: "a@b.com",
  first_name: "A",
  last_name: "B",
  title: null,
  source: null,
  lifecycle_stage: stage as EvaluableContact["lifecycle_stage"],
  companies: null,
});

describe("workflow graph engine", () => {
  it("finds the trigger node", () => {
    expect(findTriggerNode(g)?.id).toBe("t");
  });

  it("follows a linear edge", () => {
    expect(nextNodeId(g, "t")).toBe("a1");
    expect(nextNodeId(g, "a1")).toBe("b");
  });

  it("returns null at a leaf node", () => {
    expect(nextNodeId(g, "yes")).toBeNull();
  });

  it("routes a branch by its true/false handle", () => {
    expect(nextNodeId(g, "b", true)).toBe("yes");
    expect(nextNodeId(g, "b", false)).toBe("no");
  });

  it("evaluates a legacy single-rule branch against a contact", () => {
    const branchNode = g.nodes.find((n) => n.id === "b") as WFNode;
    expect(evaluateBranch(branchNode, contact("qualified"))).toBe(true);
    expect(evaluateBranch(branchNode, contact("new"))).toBe(false);
  });

  it("evaluates a multi-rule branch with all/any matching", () => {
    const node = (match: "all" | "any"): WFNode => ({
      id: "mb",
      position: { x: 0, y: 0 },
      data: {
        kind: "action",
        action: "branch",
        label: "Branch",
        config: {
          match,
          rules: [
            { field: "lifecycle_stage", op: "equals", value: "qualified" },
            { field: "email", op: "contains", value: "@acme.com" },
          ],
        },
      },
    });
    const acme = { ...contact("qualified"), email: "a@acme.com" };
    const other = { ...contact("qualified"), email: "a@other.com" };
    // ALL: both must hold.
    expect(evaluateBranch(node("all"), acme)).toBe(true);
    expect(evaluateBranch(node("all"), other)).toBe(false);
    // ANY: stage alone satisfies it.
    expect(evaluateBranch(node("any"), other)).toBe(true);
  });

  it("ends the run when a branch handle isn't wired (no misroute)", () => {
    const partial: WorkflowGraph = {
      nodes: g.nodes,
      edges: [
        { id: "e1", source: "t", target: "a1" },
        { id: "e2", source: "a1", target: "b" },
        { id: "e3", source: "b", target: "yes", sourceHandle: "true" },
      ],
    };
    expect(nextNodeId(partial, "b", true)).toBe("yes");
    // No "false" edge — must not fall through to the "true" target.
    expect(nextNodeId(partial, "b", false)).toBeNull();
  });

  it("parseGraph tolerates junk", () => {
    expect(parseGraph(null)).toEqual({ nodes: [], edges: [] });
    expect(parseGraph({ nodes: "x" })).toEqual({ nodes: [], edges: [] });
  });
});

describe("graph-structure validation", () => {
  it("accepts a well-formed graph", () => {
    expect(validateGraph(g)).toEqual([]);
  });

  it("warns when the trigger has no steps", () => {
    const only: WorkflowGraph = {
      nodes: [g.nodes[0]],
      edges: [],
    };
    const issues = validateGraph(only);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
  });

  it("flags an unreachable action as an error", () => {
    const orphaned: WorkflowGraph = {
      nodes: g.nodes,
      edges: g.edges.filter((e) => e.id !== "e1"), // disconnect a1 from trigger
    };
    const issues = validateGraph(orphaned);
    expect(issues.some((i) => i.severity === "error" && i.nodeId === "a1")).toBe(
      true
    );
  });

  it("warns on a branch missing a path", () => {
    const partial: WorkflowGraph = {
      nodes: g.nodes,
      edges: g.edges.filter((e) => e.id !== "e4"), // drop the "false" edge
    };
    const issues = validateGraph(partial);
    expect(
      issues.some((i) => i.severity === "warning" && i.nodeId === "b")
    ).toBe(true);
  });

  it("warns on ambiguous fan-out from a non-branch node", () => {
    const fanout: WorkflowGraph = {
      nodes: g.nodes,
      edges: [
        ...g.edges,
        { id: "extra", source: "a1", target: "no" }, // a1 -> two targets
      ],
    };
    const issues = validateGraph(fanout);
    expect(
      issues.some((i) => i.severity === "warning" && i.nodeId === "a1")
    ).toBe(true);
  });

  it("detects a cycle as an error", () => {
    const cyclic: WorkflowGraph = {
      nodes: g.nodes,
      edges: [...g.edges, { id: "loop", source: "yes", target: "a1" }],
    };
    const issues = validateGraph(cyclic);
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });
});

describe("exit criteria", () => {
  it("sanitizes and reports all supported criteria", () => {
    const cfg = parseExitConfig({
      onReply: true,
      goalStage: "won",
      segmentId: "seg1",
      match: "any",
      rules: [
        { field: "lifecycle_stage", op: "equals", value: "qualified" },
        { field: "email", op: "contains", value: "@acme.com" },
      ],
    });
    expect(cfg.onReply).toBe(true);
    expect(cfg.goalStage).toBe("won");
    expect(cfg.segmentId).toBe("seg1");
    expect(cfg.match).toBe("any");
    expect(cfg.rules).toHaveLength(2);
    expect(hasExitCriteria(cfg)).toBe(true);
  });

  it("drops junk and treats empty config as no criteria", () => {
    const cfg = parseExitConfig({ goalStage: "nope", segmentId: "", rules: [] });
    expect(cfg.goalStage).toBeUndefined();
    expect(cfg.segmentId).toBeUndefined();
    expect(cfg.rules).toBeUndefined();
    expect(hasExitCriteria(cfg)).toBe(false);
  });

  it("summarizes criteria with a segment name resolver", () => {
    const lines = describeExit(
      { onReply: true, segmentId: "s1" },
      { segmentName: () => "Customers" }
    );
    expect(lines).toContain("Exit when the contact replies");
    expect(lines).toContain("Exit when the contact joins Customers");
  });
});

describe("auto-layout", () => {
  it("stacks nodes by depth from the trigger", () => {
    const pos = autoLayout(g, { rowGap: 100, originY: 0 });
    // trigger at row 0, a1 at row 1, branch at row 2, yes/no at row 3.
    expect(pos.t.y).toBe(0);
    expect(pos.a1.y).toBe(100);
    expect(pos.b.y).toBe(200);
    expect(pos.yes.y).toBe(300);
    expect(pos.no.y).toBe(300);
  });

  it("centers siblings and separates the two branch paths", () => {
    const pos = autoLayout(g);
    expect(pos.yes.x).not.toBe(pos.no.x);
    // A single node in its row is centered on the origin.
    expect(pos.t.x).toBe(250);
  });
});

describe("step validation", () => {
  it("flags an unconfigured send_email and clears when filled", () => {
    expect(actionConfigErrors("send_email", {})).toHaveLength(2);
    expect(
      actionConfigErrors("send_email", { subject: "Hi", body: "Hello" })
    ).toEqual([]);
    expect(
      actionConfigErrors("send_email", { subject: "  ", body: "Hello" })
    ).toHaveLength(1);
  });

  it("requires a positive wait", () => {
    expect(actionConfigErrors("wait", { minutes: 0 })).toHaveLength(1);
    expect(actionConfigErrors("wait", { minutes: 60 })).toEqual([]);
  });

  it("requires a stage / segment for the relevant actions", () => {
    expect(actionConfigErrors("set_lifecycle", {})).toHaveLength(1);
    expect(actionConfigErrors("set_lifecycle", { stage: "won" })).toEqual([]);
    expect(actionConfigErrors("add_to_segment", {})).toHaveLength(1);
    expect(actionConfigErrors("add_to_segment", { segmentId: "s1" })).toEqual(
      []
    );
    expect(actionConfigErrors("enroll_campaign", {})).toHaveLength(1);
    expect(
      actionConfigErrors("enroll_campaign", { campaignId: "c1" })
    ).toEqual([]);
    expect(actionConfigErrors("move_to_workflow", {})).toHaveLength(1);
    expect(
      actionConfigErrors("move_to_workflow", { workflowId: "w1" })
    ).toEqual([]);
    // end_flow needs no configuration.
    expect(actionConfigErrors("end_flow", {})).toEqual([]);
  });

  it("validates branch conditions, ignoring value for valueless ops", () => {
    expect(
      actionConfigErrors("branch", {
        field: "email",
        op: "contains",
        value: "",
      })
    ).toHaveLength(1);
    expect(
      actionConfigErrors("branch", {
        field: "email",
        op: "contains",
        value: "acme",
      })
    ).toEqual([]);
    expect(
      actionConfigErrors("branch", { field: "email", op: "is_empty" })
    ).toEqual([]);
  });

  it("marks end_flow and move_to_workflow as terminal", () => {
    expect(isTerminalAction("end_flow")).toBe(true);
    expect(isTerminalAction("move_to_workflow")).toBe(true);
    expect(isTerminalAction("send_email")).toBe(false);
    expect(isTerminalAction(undefined)).toBe(false);
  });

  it("requires a segment only for segment_entry triggers", () => {
    expect(triggerConfigErrors("manual", {})).toEqual([]);
    expect(triggerConfigErrors("segment_entry", {})).toHaveLength(1);
    expect(
      triggerConfigErrors("segment_entry", { segmentId: "s1" })
    ).toEqual([]);
  });
});

describe("step descriptions", () => {
  it("formats wait durations", () => {
    expect(formatMinutes(0)).toBe("No delay");
    expect(formatMinutes(30)).toBe("Wait 30 min");
    expect(formatMinutes(120)).toBe("Wait 2 hours");
    expect(formatMinutes(1440)).toBe("Wait 1 day");
    expect(formatMinutes(2880)).toBe("Wait 2 days");
  });

  it("summarises actions", () => {
    expect(
      describeAction("send_email", { subject: "Welcome" })
    ).toBe("“Welcome”");
    expect(describeAction("set_lifecycle", { stage: "won" })).toBe(
      "Set to Won"
    );
    expect(
      describeAction(
        "add_to_segment",
        { segmentId: "s1" },
        { segmentName: () => "VIPs" }
      )
    ).toBe("Add to VIPs");
    expect(
      describeAction(
        "enroll_campaign",
        { campaignId: "c1" },
        { campaignName: () => "Spring promo" }
      )
    ).toBe("Enroll in Spring promo");
    expect(
      describeAction(
        "move_to_workflow",
        { workflowId: "w1" },
        { workflowName: () => "Nurture B" }
      )
    ).toBe("Move to Nurture B");
    expect(describeAction("end_flow", {})).toBe("Ends the run — no further steps");
    expect(
      describeAction("branch", {
        field: "lifecycle_stage",
        op: "equals",
        value: "won",
      })
    ).toBe("If Lifecycle stage is won");
    expect(describeAction("send_email", {})).toBe("");
  });

  it("summarises the trigger with its target segment", () => {
    expect(describeTrigger("manual")).toBe("Manual enrolment");
    expect(
      describeTrigger("segment_entry", {
        segmentId: "s1",
        segmentName: () => "VIPs",
      })
    ).toBe("On segment entry · VIPs");
    expect(describeTrigger("activity_logged")).toBe("On activity logged");
    expect(
      describeTrigger("activity_logged", { activityType: "appointment" })
    ).toBe("On activity logged · appointment");
    expect(describeTrigger("email_opened")).toBe("On email open");
  });
});
