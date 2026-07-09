// Prebuilt workflow starting points offered on the "New workflow" screen.
// Each seeds the builder with a trigger + a few configured steps; the user can
// tweak everything before saving. Positions are laid out top-to-bottom; the
// builder's "Tidy up" re-flows them if edited.

import {
  ACTION_LABELS,
  type ActionType,
  type TriggerType,
  type WorkflowGraph,
} from "@/lib/workflows";

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  trigger_type: TriggerType;
  graph: WorkflowGraph;
};

const trigger = {
  id: "trigger",
  type: "hs",
  position: { x: 250, y: 20 },
  data: { kind: "trigger" as const, label: "Trigger" },
};

function action(
  id: string,
  act: ActionType,
  y: number,
  config: Record<string, unknown>
) {
  return {
    id,
    type: "hs",
    position: { x: 250, y },
    data: { kind: "action" as const, action: act, label: ACTION_LABELS[act], config },
  };
}

const edge = (source: string, target: string) => ({
  id: `e-${source}-${target}`,
  source,
  target,
  sourceHandle: null,
});

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "welcome-nurture",
    name: "Welcome new leads",
    description:
      "Greet contacts as they enter a segment, wait two days, then follow up.",
    trigger_type: "segment_entry",
    graph: {
      nodes: [
        trigger,
        action("s1", "send_email", 150, {
          subject: "Welcome, {{first_name}}!",
          body: "<p>Hi {{first_name}}, thanks for your interest in {{company}}.</p>",
        }),
        action("w1", "wait", 280, { mode: "delay", minutes: 2880 }),
        action("s2", "send_email", 410, {
          subject: "A quick idea for {{company}}",
          body: "<p>Following up with something that might help.</p>",
        }),
      ],
      edges: [edge("trigger", "s1"), edge("s1", "w1"), edge("w1", "s2")],
    },
  },
  {
    id: "reengage-qualify",
    name: "Re-engage & qualify",
    description:
      "Email a segment on demand, pause, then mark contacted for the sales team.",
    trigger_type: "manual",
    graph: {
      nodes: [
        trigger,
        action("s1", "send_email", 150, {
          subject: "Still thinking it over, {{first_name}}?",
          body: "<p>Happy to answer any questions.</p>",
        }),
        action("w1", "wait", 280, { mode: "delay", minutes: 4320 }),
        action("l1", "set_lifecycle", 410, { stage: "contacted" }),
      ],
      edges: [edge("trigger", "s1"), edge("s1", "w1"), edge("w1", "l1")],
    },
  },
  {
    id: "reply-router",
    name: "Route replies to sales",
    description:
      "When a contact replies, mark them qualified and ping an external webhook.",
    trigger_type: "reply",
    graph: {
      nodes: [
        trigger,
        action("l1", "set_lifecycle", 150, { stage: "qualified" }),
        action("h1", "webhook", 280, { url: "" }),
      ],
      edges: [edge("trigger", "l1"), edge("l1", "h1")],
    },
  },
];
