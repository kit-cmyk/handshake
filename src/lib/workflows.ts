// Workflow graph model + a pure execution helper set (traversal, branch eval).
// Branch conditions reuse the segments rule evaluator.

import {
  matchesDefinition,
  fieldDef,
  OPERATOR_LABELS,
  VALUELESS_OPS,
  type EvaluableContact,
  type Operator,
  type Rule,
  type SegmentDefinition,
} from "./segments";
import { LIFECYCLE_LABELS, LIFECYCLE_STAGES, type LifecycleStage } from "./types";

export type TriggerType =
  | "manual"
  | "segment_entry"
  | "reply"
  | "stage_change"
  | "activity_logged"
  | "email_opened"
  | "email_clicked";

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  manual: "Manual — enroll a segment on demand",
  segment_entry: "Segment entry — when a contact joins a segment",
  reply: "Reply — when a contact replies to a campaign or workflow",
  stage_change: "Stage change — when a contact's lifecycle changes",
  activity_logged: "Activity logged — when an activity is recorded",
  email_opened: "Email opened — when a contact opens a tracked email",
  email_clicked: "Link clicked — when a contact clicks a link in an email",
};

export type ActionType =
  | "send_email"
  | "wait"
  | "set_lifecycle"
  | "add_to_segment"
  | "enroll_campaign"
  | "move_to_workflow"
  | "webhook"
  | "branch"
  | "end_flow";

export const ACTION_LABELS: Record<ActionType, string> = {
  send_email: "Send email",
  wait: "Wait",
  set_lifecycle: "Set lifecycle stage",
  add_to_segment: "Add to segment",
  enroll_campaign: "Enroll in campaign",
  move_to_workflow: "Move to workflow",
  webhook: "Call webhook",
  branch: "Branch (if / else)",
  end_flow: "End of flow",
};

/**
 * Terminal actions stop the contact's run: no step can follow them. `end_flow`
 * simply ends the run; `move_to_workflow` transfers the contact into another
 * workflow and ends this run.
 */
export const TERMINAL_ACTIONS: ActionType[] = ["end_flow", "move_to_workflow"];

export function isTerminalAction(action?: ActionType): boolean {
  return !!action && TERMINAL_ACTIONS.includes(action);
}

export type NodeKind = "trigger" | "action";

export type NodeData = {
  kind: NodeKind;
  action?: ActionType;
  label: string;
  config?: Record<string, unknown>;
};

export type WFNode = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: NodeData;
};

export type WFEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
};

export type WorkflowGraph = { nodes: WFNode[]; edges: WFEdge[] };

export const EMPTY_GRAPH: WorkflowGraph = { nodes: [], edges: [] };

export type WorkflowStatus = "draft" | "running" | "paused" | "ended";

/**
 * Optional early-exit rules evaluated while a run is in flight. Each is
 * independent; if any fires the run stops before its next step.
 */
export type ExitConfig = {
  /** Stop the run when the contact replies to a workflow email. */
  onReply?: boolean;
  /** Stop the run when the contact reaches this lifecycle stage. */
  goalStage?: LifecycleStage;
  /** Stop the run when the contact becomes a member of this segment. */
  segmentId?: string;
  /** Combine `rules` with all (AND) or any (OR). Defaults to all. */
  match?: "all" | "any";
  /** Stop the run when the contact matches these field conditions. */
  rules?: Rule[];
};

export type Workflow = {
  id: string;
  org_id: string;
  name: string;
  status: WorkflowStatus;
  trigger_type: TriggerType;
  trigger_config: Record<string, unknown>;
  exit_config: ExitConfig;
  mailbox_id: string | null;
  graph: WorkflowGraph;
  created_at: string;
  updated_at: string;
};

/** Sanitize an exit-config bag parsed from jsonb / form input. */
export function parseExitConfig(raw: unknown): ExitConfig {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as {
    onReply?: unknown;
    goalStage?: unknown;
    segmentId?: unknown;
    match?: unknown;
    rules?: unknown;
  };
  const out: ExitConfig = {};
  if (obj.onReply === true) out.onReply = true;
  if (
    typeof obj.goalStage === "string" &&
    LIFECYCLE_STAGES.includes(obj.goalStage as LifecycleStage)
  )
    out.goalStage = obj.goalStage as LifecycleStage;
  if (typeof obj.segmentId === "string" && obj.segmentId) out.segmentId = obj.segmentId;
  if (Array.isArray(obj.rules)) {
    const def = branchDefinition({ match: obj.match, rules: obj.rules });
    if (def.rules.length) {
      out.match = def.match;
      out.rules = def.rules;
    }
  }
  return out;
}

/** True when the exit config has at least one active criterion. */
export function hasExitCriteria(cfg: ExitConfig): boolean {
  return !!(
    cfg.onReply ||
    cfg.goalStage ||
    cfg.segmentId ||
    (cfg.rules && cfg.rules.length)
  );
}

/** Human-readable summary of exit criteria, e.g. for the workflow overview. */
export function describeExit(
  cfg: ExitConfig,
  ctx: { segmentName?: (id: string) => string } = {}
): string[] {
  const out: string[] = [];
  if (cfg.onReply) out.push("Exit when the contact replies");
  if (cfg.goalStage)
    out.push(`Exit when the contact reaches ${LIFECYCLE_LABELS[cfg.goalStage]}`);
  if (cfg.segmentId)
    out.push(
      `Exit when the contact joins ${ctx.segmentName?.(cfg.segmentId) ?? "a segment"}`
    );
  if (cfg.rules && cfg.rules.length) {
    if (cfg.rules.length === 1) out.push(`Exit when ${describeRule(cfg.rules[0])}`);
    else
      out.push(
        `Exit when ${cfg.match === "any" ? "any of" : "all of"} ${cfg.rules.length} conditions match`
      );
  }
  return out;
}

export type WorkflowRunStatus = "active" | "completed" | "failed" | "stopped";

export function findTriggerNode(g: WorkflowGraph): WFNode | undefined {
  return g.nodes.find((n) => n.data?.kind === "trigger");
}

export function getNode(g: WorkflowGraph, id: string): WFNode | undefined {
  return g.nodes.find((n) => n.id === id);
}

export function outgoing(g: WorkflowGraph, nodeId: string): WFEdge[] {
  return g.edges.filter((e) => e.source === nodeId);
}

/**
 * Next node to run after `nodeId`. For branch nodes pass the boolean result;
 * the matching "true"/"false" edge handle is followed (falls back to first edge).
 */
export function nextNodeId(
  g: WorkflowGraph,
  nodeId: string,
  branch?: boolean
): string | null {
  const edges = outgoing(g, nodeId);
  if (edges.length === 0) return null;
  if (branch !== undefined) {
    // Follow only the matching handle. If that path isn't wired, the run ends
    // here — never fall back to the other branch (that would misroute).
    const handle = branch ? "true" : "false";
    const match = edges.find((e) => e.sourceHandle === handle);
    return match ? match.target : null;
  }
  return edges[0].target;
}

type Config = Record<string, unknown>;

const str = (config: Config, key: string): string =>
  typeof config[key] === "string" ? (config[key] as string).trim() : "";

/**
 * Normalize a branch node's config into a segment-style definition. Supports
 * both the multi-condition shape `{ match, rules }` and the legacy single-rule
 * shape `{ field, op, value }`, so old workflows keep evaluating correctly.
 */
export function branchDefinition(config: Config = {}): SegmentDefinition {
  if (Array.isArray((config as { rules?: unknown }).rules)) {
    const rules = ((config as { rules: unknown[] }).rules).filter(
      (r): r is Rule =>
        !!r && typeof (r as Rule).field === "string" && !!(r as Rule).op
    );
    return {
      match: (config as { match?: string }).match === "any" ? "any" : "all",
      rules,
    };
  }
  const field = str(config, "field");
  const op = config.op as Operator | undefined;
  if (field && op) {
    return { match: "all", rules: [{ field, op, value: str(config, "value") }] };
  }
  return { match: "all", rules: [] };
}

export function evaluateBranch(
  node: WFNode,
  contact: EvaluableContact
): boolean {
  const def = branchDefinition(node.data.config ?? {});
  if (!def.rules.length) return false;
  return matchesDefinition(contact, def);
}

// ---------------------------------------------------------------------------
// Step validation + human-readable descriptions (shared by the builder UI and
// the save action). All pure so they can be unit-tested and run on the server.
// ---------------------------------------------------------------------------

/** Validation messages for an action node's config. Empty array = configured. */
export function actionConfigErrors(
  action: ActionType,
  config: Config = {}
): string[] {
  const errors: string[] = [];
  switch (action) {
    case "send_email":
      if (!str(config, "subject")) errors.push("Add a subject line.");
      if (!str(config, "body")) errors.push("Add an email body.");
      break;
    case "wait": {
      if (config.mode === "until_time") {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(str(config, "time")))
          errors.push("Set a valid time of day (HH:MM).");
      } else {
        const minutes = Number(config.minutes);
        if (!Number.isFinite(minutes) || minutes <= 0)
          errors.push("Set a wait time greater than 0 minutes.");
      }
      break;
    }
    case "set_lifecycle":
      if (!str(config, "stage")) errors.push("Choose a lifecycle stage.");
      break;
    case "add_to_segment":
      if (!str(config, "segmentId")) errors.push("Choose a segment.");
      break;
    case "enroll_campaign":
      if (!str(config, "campaignId"))
        errors.push("Choose a campaign to enroll into.");
      break;
    case "move_to_workflow":
      if (!str(config, "workflowId"))
        errors.push("Choose a workflow to move the contact to.");
      break;
    case "end_flow":
      // No configuration — reaching it simply ends the run.
      break;
    case "webhook": {
      const url = str(config, "url");
      if (!url) errors.push("Enter a webhook URL.");
      else if (!/^https:\/\/.+/i.test(url))
        errors.push("Webhook URL must start with https://");
      break;
    }
    case "branch": {
      const def = branchDefinition(config);
      if (!def.rules.length) {
        errors.push("Add at least one condition.");
        break;
      }
      for (const r of def.rules) {
        if (!r.op) {
          errors.push("Choose a condition for each rule.");
        } else if (
          !VALUELESS_OPS.includes(r.op) &&
          !String(r.value ?? "").trim()
        ) {
          errors.push("Enter a value for each condition.");
        }
      }
      break;
    }
  }
  // De-duplicate repeated messages (e.g. several rules missing values).
  return [...new Set(errors)];
}

/** Validation messages for the trigger. Empty array = configured. */
export function triggerConfigErrors(
  triggerType: TriggerType,
  config: { segmentId?: string } = {}
): string[] {
  if (triggerType === "segment_entry" && !config.segmentId)
    return ["Choose the segment that enrols contacts."];
  return [];
}

const TRIGGER_SHORT: Record<TriggerType, string> = {
  manual: "Manual enrolment",
  segment_entry: "On segment entry",
  reply: "On reply",
  stage_change: "On stage change",
  activity_logged: "On activity logged",
  email_opened: "On email open",
  email_clicked: "On link click",
};

/** Short label for a wait duration, e.g. "Wait 2 days" / "Wait 30 min". */
export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "No delay";
  if (minutes % 1440 === 0) {
    const d = minutes / 1440;
    return `Wait ${d} day${d > 1 ? "s" : ""}`;
  }
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return `Wait ${h} hour${h > 1 ? "s" : ""}`;
  }
  return `Wait ${minutes} min`;
}

function describeRule(r: Rule): string {
  const label = fieldDef(r.field)?.label ?? r.field;
  const opLabel = OPERATOR_LABELS[r.op] ?? r.op;
  if (VALUELESS_OPS.includes(r.op)) return `${label} ${opLabel}`;
  return `${label} ${opLabel} ${r.value ?? ""}`.trim();
}

function describeCondition(config: Config): string {
  const def = branchDefinition(config);
  if (!def.rules.length) return "";
  const first = describeRule(def.rules[0]);
  if (def.rules.length === 1) return `If ${first}`;
  const joiner = def.match === "any" ? "any of" : "all of";
  return `If ${joiner} ${def.rules.length} conditions`;
}

/** One-line summary of an action for the canvas node. "" when unconfigured. */
export function describeAction(
  action: ActionType,
  config: Config = {},
  ctx: {
    segmentName?: (id: string) => string;
    campaignName?: (id: string) => string;
    workflowName?: (id: string) => string;
  } = {}
): string {
  switch (action) {
    case "send_email": {
      const subject = str(config, "subject");
      return subject ? `“${subject}”` : "";
    }
    case "wait":
      if (config.mode === "until_time") {
        const time = str(config, "time");
        return time ? `Wait until ${time}` : "";
      }
      return formatMinutes(Number(config.minutes));
    case "set_lifecycle": {
      const stage = str(config, "stage");
      return stage in LIFECYCLE_LABELS
        ? `Set to ${LIFECYCLE_LABELS[stage as LifecycleStage]}`
        : "";
    }
    case "add_to_segment": {
      const id = str(config, "segmentId");
      return id ? `Add to ${ctx.segmentName?.(id) ?? "segment"}` : "";
    }
    case "enroll_campaign": {
      const id = str(config, "campaignId");
      return id ? `Enroll in ${ctx.campaignName?.(id) ?? "campaign"}` : "";
    }
    case "move_to_workflow": {
      const id = str(config, "workflowId");
      return id ? `Move to ${ctx.workflowName?.(id) ?? "workflow"}` : "";
    }
    case "end_flow":
      return "Ends the run — no further steps";
    case "webhook": {
      const url = str(config, "url");
      if (!url) return "";
      try {
        return `POST ${new URL(url).host}`;
      } catch {
        return "POST webhook";
      }
    }
    case "branch":
      return describeCondition(config);
    default:
      return "";
  }
}

/** One-line summary of the trigger for the canvas node. */
export function describeTrigger(
  triggerType: TriggerType,
  ctx: {
    segmentId?: string;
    segmentName?: (id: string) => string;
    activityType?: string;
  } = {}
): string {
  const base = TRIGGER_SHORT[triggerType];
  if (
    triggerType === "activity_logged" &&
    ctx.activityType &&
    ctx.activityType !== "any"
  )
    return `${base} · ${ctx.activityType}`;
  return ctx.segmentId
    ? `${base} · ${ctx.segmentName?.(ctx.segmentId) ?? "segment"}`
    : base;
}

// ---------------------------------------------------------------------------
// Graph-structure validation. Complements the per-step config validation above:
// this checks the *shape* of the graph (reachability, routing, cycles) so the
// builder can warn and the save action can reject unrunnable graphs.
// ---------------------------------------------------------------------------

export type GraphIssueSeverity = "error" | "warning";

export type GraphIssue = {
  severity: GraphIssueSeverity;
  message: string;
  /** Node the issue is anchored to, for jump-to-node in the builder. */
  nodeId?: string;
};

/** Node ids reachable from the trigger by following edges. */
function reachableFrom(g: WorkflowGraph, startId: string): Set<string> {
  const seen = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of outgoing(g, id)) {
      if (!seen.has(e.target)) {
        seen.add(e.target);
        queue.push(e.target);
      }
    }
  }
  return seen;
}

/** True if the directed graph reachable from `startId` contains a cycle. */
function hasCycle(g: WorkflowGraph, startId: string): boolean {
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  const visit = (id: string): boolean => {
    color.set(id, GRAY);
    for (const e of outgoing(g, id)) {
      const c = color.get(e.target) ?? WHITE;
      if (c === GRAY) return true; // back-edge
      if (c === WHITE && visit(e.target)) return true;
    }
    color.set(id, BLACK);
    return false;
  };
  return visit(startId);
}

/**
 * Structural issues in a workflow graph. `error`s make the workflow unrunnable
 * (unreachable steps, cycles) and block saving; `warning`s flag likely mistakes
 * (a branch with a missing path, ambiguous fan-out) but still save.
 */
export function validateGraph(g: WorkflowGraph): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const trigger = findTriggerNode(g);
  const actions = g.nodes.filter((n) => n.data?.kind === "action");

  if (!trigger) {
    issues.push({ severity: "error", message: "The workflow has no trigger." });
    return issues;
  }

  if (actions.length === 0) {
    issues.push({
      severity: "warning",
      message: "Add at least one step after the trigger.",
      nodeId: trigger.id,
    });
    return issues;
  }

  if (outgoing(g, trigger.id).length === 0) {
    issues.push({
      severity: "warning",
      message: "Connect the trigger to your first step.",
      nodeId: trigger.id,
    });
  }

  const reachable = reachableFrom(g, trigger.id);
  for (const n of actions) {
    if (!reachable.has(n.id)) {
      issues.push({
        severity: "error",
        message: `“${n.data.label}” can't be reached from the trigger.`,
        nodeId: n.id,
      });
    }
  }

  for (const n of g.nodes) {
    const edges = outgoing(g, n.id);
    if (isTerminalAction(n.data?.action) && edges.length > 0) {
      issues.push({
        severity: "warning",
        message: `“${n.data.label}” ends the run — steps connected after it never run.`,
        nodeId: n.id,
      });
    } else if (n.data?.action === "branch") {
      const hasTrue = edges.some((e) => e.sourceHandle === "true");
      const hasFalse = edges.some((e) => e.sourceHandle === "false");
      if (!hasTrue || !hasFalse) {
        const missing = !hasTrue && !hasFalse ? "Yes and No" : !hasTrue ? "Yes" : "No";
        issues.push({
          severity: "warning",
          message: `Branch “${n.data.label}” has no ${missing} path — contacts there will exit the workflow.`,
          nodeId: n.id,
        });
      }
    } else if (n.data?.kind === "action" && edges.length > 1) {
      issues.push({
        severity: "warning",
        message: `“${n.data.label}” connects to more than one step; only the first is followed. Use a Branch to split.`,
        nodeId: n.id,
      });
    }
  }

  if (hasCycle(g, trigger.id)) {
    issues.push({
      severity: "error",
      message: "The workflow loops back on itself. Remove the cycle.",
    });
  }

  return issues;
}

/**
 * Deterministic layered auto-layout. BFS from the trigger assigns each node a
 * depth (row); siblings are spread horizontally and centered. Unreached nodes
 * are parked in a row below. Pure — returns new positions keyed by node id.
 */
export function autoLayout(
  g: WorkflowGraph,
  opts: { colGap?: number; rowGap?: number; originX?: number; originY?: number } = {}
): Record<string, { x: number; y: number }> {
  const colGap = opts.colGap ?? 220;
  const rowGap = opts.rowGap ?? 130;
  const originX = opts.originX ?? 250;
  const originY = opts.originY ?? 20;

  const trigger = findTriggerNode(g);
  const levels: string[][] = [];
  const levelOf = new Map<string, number>();
  const seen = new Set<string>();

  const start = trigger?.id ?? g.nodes[0]?.id;
  if (start) {
    let frontier = [start];
    seen.add(start);
    let depth = 0;
    while (frontier.length) {
      levels[depth] = frontier;
      frontier.forEach((id) => levelOf.set(id, depth));
      const next: string[] = [];
      for (const id of frontier) {
        for (const e of outgoing(g, id)) {
          if (!seen.has(e.target)) {
            seen.add(e.target);
            next.push(e.target);
          }
        }
      }
      frontier = next;
      depth++;
    }
  }

  // Any node not reached from the trigger goes in a trailing row.
  const orphans = g.nodes.filter((n) => !seen.has(n.id)).map((n) => n.id);
  if (orphans.length) levels.push(orphans);

  const pos: Record<string, { x: number; y: number }> = {};
  levels.forEach((ids, row) => {
    const width = (ids.length - 1) * colGap;
    ids.forEach((id, i) => {
      pos[id] = {
        x: originX + i * colGap - width / 2,
        y: originY + row * rowGap,
      };
    });
  });
  return pos;
}

/** Sanitize a graph parsed from jsonb. */
export function parseGraph(raw: unknown): WorkflowGraph {
  if (!raw || typeof raw !== "object") return { ...EMPTY_GRAPH };
  const obj = raw as { nodes?: unknown; edges?: unknown };
  const nodes = Array.isArray(obj.nodes) ? (obj.nodes as WFNode[]) : [];
  const edges = Array.isArray(obj.edges) ? (obj.edges as WFEdge[]) : [];
  return { nodes, edges };
}
