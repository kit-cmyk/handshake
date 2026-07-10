"use client";

import "@xyflow/react/dist/style.css";
import * as React from "react";
import { useActionState, useTransition } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  Mail,
  Clock,
  UserCog,
  ListPlus,
  Megaphone,
  ArrowRightLeft,
  GitBranch,
  Copy,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Undo2,
  Redo2,
  Wand2,
  Send,
  Webhook,
  Flag,
  Plus,
  ArrowLeft,
  ArrowRight,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RichEmailEditor, type EmailSnippet } from "@/components/rich-email-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  nodeTypes,
  edgeTypes,
  AddStepContext,
  NodeMetaContext,
  HasOutgoingContext,
} from "./flow-node";
import type { WorkflowTemplate } from "./templates";
import {
  saveWorkflow,
  countSegmentContacts,
  sendTestWorkflowEmail,
  type WorkflowState,
} from "./actions";
import {
  ACTION_LABELS,
  TRIGGER_LABELS,
  actionConfigErrors,
  triggerConfigErrors,
  describeAction,
  describeTrigger,
  validateGraph,
  autoLayout,
  type ActionType,
  type NodeData,
  type TriggerType,
  type Workflow,
  type WorkflowGraph,
} from "@/lib/workflows";
import {
  SEGMENT_FIELDS,
  OPERATORS_FOR_KIND,
  OPERATOR_LABELS,
  VALUELESS_OPS,
  fieldDef,
  type Operator,
} from "@/lib/segments";
import { LIFECYCLE_STAGES, LIFECYCLE_LABELS, ACTIVITY_TYPES } from "@/lib/types";

type Option = { id: string; name: string };
type MailboxOption = {
  id: string;
  name: string;
  email: string;
  displayName: string | null;
};
const NONE = "none";

const WIZARD_STEPS = [
  { n: 1, label: "Details" },
  { n: 2, label: "Workflow Setup" },
  { n: 3, label: "Review" },
] as const;

function genId(count: number): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `n${count + 1}`;
}

const PALETTE: { action: ActionType; icon: typeof Mail }[] = [
  { action: "send_email", icon: Mail },
  { action: "wait", icon: Clock },
  { action: "set_lifecycle", icon: UserCog },
  { action: "add_to_segment", icon: ListPlus },
  { action: "enroll_campaign", icon: Megaphone },
  { action: "move_to_workflow", icon: ArrowRightLeft },
  { action: "webhook", icon: Webhook },
  { action: "branch", icon: GitBranch },
  { action: "end_flow", icon: Flag },
];

const TRIGGER_TYPES: TriggerType[] = [
  "manual",
  "segment_entry",
  "reply",
  "stage_change",
  "activity_logged",
  "email_opened",
  "email_clicked",
];

// Personalization tokens supported by the email renderer (see lib/email/template).
const MERGE_TAGS = ["first_name", "last_name", "full_name", "company"] as const;

const DEFAULT_CONFIG: Partial<Record<ActionType, Record<string, unknown>>> = {
  wait: { mode: "delay", minutes: 1440 },
  branch: {
    match: "all",
    rules: [{ field: "lifecycle_stage", op: "equals", value: "" }],
  },
  webhook: { url: "" },
};

function initialNodes(wf?: Workflow, template?: WorkflowTemplate): Node[] {
  const seed = wf?.graph?.nodes?.length
    ? wf.graph.nodes
    : template?.graph.nodes;
  if (seed?.length) {
    return (seed as unknown as Node[]).map((n) => ({ ...n, type: "hs" }));
  }
  return [
    {
      id: "trigger",
      type: "hs",
      position: { x: 250, y: 20 },
      data: { kind: "trigger", label: "Trigger" },
    },
  ];
}

export function WorkflowBuilder({
  workflow,
  template,
  segments,
  campaigns,
  workflows,
  mailboxes,
  emailTemplates,
}: {
  workflow?: Workflow;
  template?: WorkflowTemplate;
  segments: Option[];
  campaigns: Option[];
  workflows: Option[];
  mailboxes: MailboxOption[];
  emailTemplates?: EmailSnippet[];
}) {
  const [state, formAction, pending] = useActionState<WorkflowState, FormData>(
    saveWorkflow,
    {}
  );
  const [name, setName] = React.useState(workflow?.name ?? template?.name ?? "");
  const [triggerType, setTriggerType] = React.useState<TriggerType>(
    workflow?.trigger_type ?? template?.trigger_type ?? "manual"
  );
  const [segmentId, setSegmentId] = React.useState<string>(
    (workflow?.trigger_config as { segmentId?: string })?.segmentId ?? NONE
  );
  // Lifecycle stage that enrolls contacts for a `stage_change` trigger.
  const [entryStage, setEntryStage] = React.useState<string>(
    (workflow?.trigger_config as { stage?: string })?.stage ?? NONE
  );
  // Activity type that enrolls contacts for an `activity_logged` trigger.
  const [entryActivity, setEntryActivity] = React.useState<string>(
    (workflow?.trigger_config as { activityType?: string })?.activityType ?? "any"
  );
  const [mailboxId, setMailboxId] = React.useState<string>(
    workflow?.mailbox_id ?? NONE
  );
  const [exitOnReply, setExitOnReply] = React.useState<boolean>(
    workflow?.exit_config?.onReply ?? false
  );
  const [goalStage, setGoalStage] = React.useState<string>(
    workflow?.exit_config?.goalStage ?? NONE
  );
  const [exitSegmentId, setExitSegmentId] = React.useState<string>(
    workflow?.exit_config?.segmentId ?? NONE
  );
  const [exitCond, setExitCond] = React.useState<{
    match: "all" | "any";
    rules: BranchRule[];
  } | null>(
    workflow?.exit_config?.rules?.length
      ? {
          match: workflow.exit_config.match === "any" ? "any" : "all",
          rules: workflow.exit_config.rules as BranchRule[],
        }
      : null
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(
    initialNodes(workflow, template)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    (
      ((workflow?.graph?.edges ?? template?.graph.edges) as unknown as Edge[]) ??
      []
    ).map((e) => ({ ...e, type: "hs" }))
  );
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  // Which node's validation errors to surface (only after a Save-step attempt).
  const [errorsForId, setErrorsForId] = React.useState<string | null>(null);
  const [addContext, setAddContext] = React.useState<{
    fromId: string;
    handle?: "true" | "false";
  } | null>(null);
  const [rf, setRf] = React.useState<ReactFlowInstance | null>(null);

  // Undo/redo: snapshot the graph before each structural edit.
  const past = React.useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const futureRef = React.useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [canUndo, setCanUndo] = React.useState(false);
  const [canRedo, setCanRedo] = React.useState(false);

  const snapshot = React.useCallback(() => {
    past.current.push({ nodes, edges });
    if (past.current.length > 50) past.current.shift();
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, [nodes, edges]);

  const undo = React.useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    futureRef.current.push({ nodes, edges });
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setSelectedId(null);
    setAddContext(null);
    setCanUndo(past.current.length > 0);
    setCanRedo(true);
  }, [nodes, edges, setNodes, setEdges]);

  const redo = React.useCallback(() => {
    const nextState = futureRef.current.pop();
    if (!nextState) return;
    past.current.push({ nodes, edges });
    setNodes(nextState.nodes);
    setEdges(nextState.edges);
    setSelectedId(null);
    setAddContext(null);
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
  }, [nodes, edges, setNodes, setEdges]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const onConnect = React.useCallback(
    (c: Connection) => {
      snapshot();
      setEdges((eds) => addEdge({ ...c, type: "hs" }, eds));
    },
    [snapshot, setEdges]
  );

  // Does a node (or a branch handle) already have an outgoing edge? Drives
  // whether the node shows its own "+" or defers to the edge's midpoint "+".
  const hasOutgoing = React.useCallback(
    (nodeId: string, handle?: "true" | "false") =>
      edges.some(
        (e) =>
          e.source === nodeId &&
          (handle === undefined || (e.sourceHandle ?? undefined) === handle)
      ),
    [edges]
  );

  const segmentName = React.useCallback(
    (id: string) => segments.find((s) => s.id === id)?.name ?? "segment",
    [segments]
  );

  const campaignName = React.useCallback(
    (id: string) => campaigns.find((c) => c.id === id)?.name ?? "campaign",
    [campaigns]
  );

  const workflowName = React.useCallback(
    (id: string) => workflows.find((w) => w.id === id)?.name ?? "workflow",
    [workflows]
  );

  // A workflow can't move contacts into itself.
  const otherWorkflows = workflows.filter((w) => w.id !== workflow?.id);

  const activeSegmentId = segmentId === NONE ? undefined : segmentId;

  // Description + completeness for each canvas node. Depends on live trigger
  // state and segment names, so it lives here and reaches nodes via context.
  const nodeMeta = React.useCallback(
    (_id: string, data: NodeData) => {
      if (data.kind === "trigger") {
        return {
          description: describeTrigger(triggerType, {
            segmentId: activeSegmentId,
            segmentName,
            activityType:
              triggerType === "activity_logged" ? entryActivity : undefined,
          }),
          incomplete:
            triggerConfigErrors(triggerType, { segmentId: activeSegmentId })
              .length > 0,
        };
      }
      const action = data.action;
      if (!action) return { description: "", incomplete: true };
      const config = (data.config ?? {}) as Record<string, unknown>;
      return {
        description: describeAction(action, config, {
          segmentName,
          campaignName,
          workflowName,
        }),
        incomplete: actionConfigErrors(action, config).length > 0,
      };
    },
    [
      triggerType,
      activeSegmentId,
      segmentName,
      campaignName,
      workflowName,
      entryActivity,
    ]
  );

  const requestAddStep = React.useCallback(
    (fromId: string, handle?: "true" | "false") => {
      setSelectedId(null);
      setAddContext({ fromId, handle });
    },
    []
  );

  function addNextStep(
    action: ActionType,
    fromId: string,
    sourceHandle?: "true" | "false"
  ) {
    snapshot();
    const from = nodes.find((n) => n.id === fromId);
    const id = genId(nodes.length);
    const pos = from
      ? {
          x:
            from.position.x +
            (sourceHandle === "true" ? -120 : sourceHandle === "false" ? 120 : 0),
          y: from.position.y + 130,
        }
      : { x: 250, y: 140 };
    setNodes((ns) => [
      ...ns,
      {
        id,
        type: "hs",
        position: pos,
        data: {
          kind: "action",
          action,
          label: ACTION_LABELS[action],
          config: { ...(DEFAULT_CONFIG[action] ?? {}) },
        },
      },
    ]);
    setEdges((es) =>
      es.concat({
        id: `e-${fromId}-${id}${sourceHandle ? `-${sourceHandle}` : ""}`,
        source: fromId,
        target: id,
        sourceHandle: sourceHandle ?? null,
        type: "hs",
      })
    );
    setAddContext(null);
    setSelectedId(id);
  }

  function updateSelectedConfig(patch: Record<string, unknown>) {
    if (!selectedId) return;
    setNodes((ns) =>
      ns.map((n) =>
        n.id === selectedId
          ? {
              ...n,
              data: {
                ...n.data,
                config: { ...(n.data.config as object), ...patch },
              },
            }
          : n
      )
    );
  }

  function removeSelected() {
    if (!selectedId || selectedId === "trigger") return;
    snapshot();
    setNodes((ns) => ns.filter((n) => n.id !== selectedId));
    setEdges((es) =>
      es.filter((e) => e.source !== selectedId && e.target !== selectedId)
    );
    setSelectedId(null);
  }

  function duplicateSelected() {
    if (!selected || selectedId === "trigger") return;
    snapshot();
    const id = genId(nodes.length);
    setNodes((ns) => [
      ...ns,
      {
        id,
        type: "hs",
        position: {
          x: selected.position.x + 48,
          y: selected.position.y + 56,
        },
        data: {
          ...selected.data,
          config: { ...((selected.data.config as object) ?? {}) },
        },
      },
    ]);
    setSelectedId(id);
  }

  function tidyUp() {
    snapshot();
    const pos = autoLayout({
      nodes: nodes.map((n) => ({
        id: n.id,
        position: n.position,
        data: n.data as NodeData,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
      })),
    });
    setNodes((ns) =>
      ns.map((n) => (pos[n.id] ? { ...n, position: pos[n.id] } : n))
    );
    window.setTimeout(() => rf?.fitView({ duration: 400 }), 60);
  }

  const selected = nodes.find((n) => n.id === selectedId);
  const selAction = selected?.data?.action as ActionType | undefined;
  const selKind = selected?.data?.kind as string | undefined;
  const cfg = (selected?.data?.config ?? {}) as Record<string, unknown>;

  const stepErrors: string[] =
    selKind === "trigger"
      ? triggerConfigErrors(triggerType, { segmentId: activeSegmentId })
      : selAction
        ? actionConfigErrors(selAction, cfg)
        : [];

  function saveStep() {
    if (stepErrors.length > 0) {
      setErrorsForId(selectedId);
      return;
    }
    setSelectedId(null);
  }

  const incompleteSteps = nodes.filter(
    (n) => nodeMeta(n.id, n.data as NodeData).incomplete
  ).length;

  // Structural issues (unreachable steps, cycles, unwired branches, fan-out).
  const graphIssues = React.useMemo(() => {
    const graph: WorkflowGraph = {
      nodes: nodes.map((n) => ({
        id: n.id,
        position: n.position,
        data: n.data as NodeData,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
      })),
    };
    return validateGraph(graph);
  }, [nodes, edges]);
  const graphErrors = graphIssues.filter((i) => i.severity === "error").length;

  // Select a node and center the canvas on it (jump-to-node from the panel).
  const jumpTo = React.useCallback(
    (nodeId?: string) => {
      if (!nodeId) return;
      setAddContext(null);
      setSelectedId(nodeId);
      const n = nodes.find((x) => x.id === nodeId);
      if (n && rf) {
        rf.setCenter(n.position.x + 90, n.position.y + 40, {
          zoom: 1.2,
          duration: 400,
        });
      }
    },
    [nodes, rf]
  );

  // Dry-run: how many contacts the chosen target segment resolves to today.
  const [segCount, setSegCount] = React.useState<number | null>(null);
  const usesSegmentTrigger =
    triggerType === "manual" || triggerType === "segment_entry";
  React.useEffect(() => {
    if (!usesSegmentTrigger || !activeSegmentId) {
      // Data-fetching effect (segment dry-run count); resetting before the async
      // fetch is intentional.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSegCount(null);
      return;
    }
    let cancelled = false;
    setSegCount(null);
    countSegmentContacts(activeSegmentId)
      .then((r) => !cancelled && setSegCount(r.count))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [usesSegmentTrigger, activeSegmentId]);

  // Test-send state for the email step.
  const [testTo, setTestTo] = React.useState("");
  const [testMsg, setTestMsg] = React.useState<string | null>(null);
  const [testPending, startTest] = useTransition();

  // Wizard: Details → Workflow Setup → Review.
  const [step, setStep] = React.useState(1);
  const selectedMailbox = mailboxes.find((m) => m.id === mailboxId);
  const senderName = selectedMailbox?.displayName || "Default sender";
  const senderEmail = selectedMailbox?.email || "your workspace default address";
  const actionCount = nodes.filter(
    (n) => (n.data as NodeData).kind === "action"
  ).length;
  const exitCount =
    (exitOnReply ? 1 : 0) +
    (goalStage !== NONE ? 1 : 0) +
    (exitSegmentId !== NONE ? 1 : 0) +
    (exitCond ? 1 : 0);

  const stepComplete = (n: number): boolean => {
    if (n === 1) return !!name.trim();
    if (n === 2) return incompleteSteps === 0 && graphErrors === 0;
    return true;
  };
  const canSubmit = !!name.trim() && incompleteSteps === 0 && graphErrors === 0;
  const closeSheets = () => {
    setSelectedId(null);
    setAddContext(null);
  };
  const goNext = () => {
    if (stepComplete(step) && step < WIZARD_STEPS.length) {
      closeSheets();
      setStep(step + 1);
    }
  };
  const goBack = () => {
    if (step > 1) {
      closeSheets();
      setStep(step - 1);
    }
  };

  const graphJson = JSON.stringify({
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
    })),
  });
  const triggerConfigJson = JSON.stringify({
    segmentId:
      usesSegmentTrigger && segmentId !== NONE ? segmentId : undefined,
    stage:
      triggerType === "stage_change" && entryStage !== NONE
        ? entryStage
        : undefined,
    activityType:
      triggerType === "activity_logged" && entryActivity !== "any"
        ? entryActivity
        : undefined,
  });
  const exitConfigJson = JSON.stringify({
    onReply: exitOnReply || undefined,
    goalStage: goalStage === NONE ? undefined : goalStage,
    segmentId: exitSegmentId === NONE ? undefined : exitSegmentId,
    match: exitCond?.match,
    rules: exitCond?.rules,
  });

  return (
    <form action={formAction} className="space-y-6">
      {workflow && <input type="hidden" name="id" value={workflow.id} />}
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="trigger_type" value={triggerType} />
      <input type="hidden" name="trigger_config" value={triggerConfigJson} />
      <input type="hidden" name="exit_config" value={exitConfigJson} />
      <input type="hidden" name="mailbox_id" value={mailboxId === NONE ? "" : mailboxId} />
      <input type="hidden" name="graph" value={graphJson} />

      {/* Step indicator */}
      <ol className="flex flex-wrap items-center gap-2">
        {WIZARD_STEPS.map((s, i) => {
          const done = stepComplete(s.n) && s.n < step;
          const active = s.n === step;
          const reachable =
            s.n === 1 ||
            WIZARD_STEPS.slice(0, s.n - 1).every((p) => stepComplete(p.n));
          return (
            <li key={s.n} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (reachable) {
                    closeSheets();
                    setStep(s.n);
                  }
                }}
                disabled={!reachable}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  active ? "font-medium" : "text-muted-foreground",
                  !reachable && "opacity-50"
                )}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full border text-xs",
                    active
                      ? "border-primary"
                      : done
                        ? "border-green-600 bg-green-600 text-white"
                        : "border-muted-foreground/40"
                  )}
                >
                  {done ? <Check className="size-3" /> : s.n}
                </span>
                {s.label}
              </button>
              {i < WIZARD_STEPS.length - 1 && (
                <span className="text-muted-foreground/40">/</span>
              )}
            </li>
          );
        })}
      </ol>

      {/* ---- Step 1: Workflow details ------------------------------------- */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Workflow details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Workflow name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. New qualified lead nurture"
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Sender</Label>
              <Select value={mailboxId} onValueChange={setMailboxId}>
                <SelectTrigger>
                  <SelectValue placeholder="Default sender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Default sender</SelectItem>
                  {mailboxes.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Sender name
              </Label>
              <p className="text-sm font-medium">{senderName}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Sender email
              </Label>
              <p className="text-sm font-medium">{senderEmail}</p>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Sender name and email come from the selected mailbox. Manage
              mailboxes in Settings — the default sender has no daily send cap.
            </p>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Workflow Setup</CardTitle>
            <p className="text-sm text-muted-foreground">
              Configure the trigger, then add steps. Click a node to set it up,
              or the <span className="font-medium">+</span> on a line to insert
              the next step.
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={tidyUp}
              title="Auto-arrange nodes"
            >
              <Wand2 className="size-4" /> Tidy up
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[520px] w-full rounded-lg border">
            <NodeMetaContext.Provider value={nodeMeta}>
              <HasOutgoingContext.Provider value={hasOutgoing}>
                <AddStepContext.Provider value={requestAddStep}>
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onInit={setRf}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeClick={(_, n) => {
                      setAddContext(null);
                      setSelectedId(n.id);
                    }}
                    fitView
                    proOptions={{ hideAttribution: true }}
                  >
                    <Background />
                    <Controls />
                    <MiniMap pannable zoomable className="!bg-muted" />
                  </ReactFlow>
                </AddStepContext.Provider>
              </HasOutgoingContext.Provider>
            </NodeMetaContext.Provider>
          </div>
        </CardContent>
      </Card>

      {graphIssues.length > 0 && (
        <div className="space-y-1.5 rounded-lg border p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Workflow checks
          </p>
          <ul className="space-y-1">
            {graphIssues.map((issue, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => jumpTo(issue.nodeId)}
                  disabled={!issue.nodeId}
                  className={cn(
                    "flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-xs",
                    issue.nodeId && "hover:bg-accent",
                    issue.severity === "error"
                      ? "text-destructive"
                      : "text-amber-600 dark:text-amber-500"
                  )}
                >
                  {issue.severity === "error" ? (
                    <AlertCircle className="mt-0.5 size-3 shrink-0" />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  )}
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
        </>
      )}

      {/* ---- Step 3: Review ---------------------------------------------- */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review workflow</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <SummaryRow label="Name" value={name || "Untitled workflow"} />
            <SummaryRow
              label="Trigger"
              value={TRIGGER_LABELS[triggerType].split(" — ")[0]}
            />
            <SummaryRow label="Sender" value={`${senderName} · ${senderEmail}`} />
            <SummaryRow
              label="Steps"
              value={`${actionCount} action${actionCount === 1 ? "" : "s"}`}
            />
            <SummaryRow
              label="Exit criteria"
              value={exitCount > 0 ? `${exitCount} set` : "None"}
            />
            {(incompleteSteps > 0 || graphErrors > 0) && (
              <p className="pt-2 text-sm text-amber-600 dark:text-amber-500">
                Finish configuring the workflow in step 2 before setting it live.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---- Footer nav --------------------------------------------------- */}
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={goBack}
          disabled={step === 1}
        >
          <ArrowLeft className="size-4" /> Back
        </Button>
        <div className="flex items-center gap-3">
          {state.error && (
            <span className="text-sm text-destructive">{state.error}</span>
          )}
          {step < WIZARD_STEPS.length ? (
            <Button
              type="button"
              onClick={goNext}
              disabled={!stepComplete(step)}
            >
              Next <ArrowRight className="size-4" />
            </Button>
          ) : (
            <>
              <Button
                type="submit"
                name="go_live"
                value="0"
                variant="outline"
                disabled={pending || !name.trim()}
              >
                {pending ? "Saving…" : workflow ? "Save changes" : "Save as draft"}
              </Button>
              <Button
                type="submit"
                name="go_live"
                value="1"
                disabled={pending || !canSubmit}
              >
                {pending ? "Saving…" : "Set live"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Side sheet — step picker (add mode) or node config */}
      <Sheet
        open={selectedId !== null || addContext !== null}
        onOpenChange={(o) => {
          if (!o) {
            setSelectedId(null);
            setAddContext(null);
          }
        }}
      >
        <SheetContent>
          {addContext ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  Add a step
                  {addContext.handle
                    ? ` to the “${addContext.handle === "true" ? "Yes" : "No"}” path`
                    : ""}
                </SheetTitle>
              </SheetHeader>
              <StepPicker
                onPick={(a) =>
                  addNextStep(a, addContext.fromId, addContext.handle)
                }
              />
            </>
          ) : (
          <>
          <SheetHeader>
            <SheetTitle>
              {selKind === "trigger"
                ? "Configure trigger"
                : selAction
                  ? ACTION_LABELS[selAction]
                  : "Configure step"}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-4">
            {/* Trigger */}
            {selKind === "trigger" && (
              <>
                <div className="space-y-2">
                  <Label>Trigger</Label>
                  <Select
                    value={triggerType}
                    onValueChange={(v) => setTriggerType(v as TriggerType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIGGER_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {TRIGGER_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {usesSegmentTrigger && (
                  <div className="space-y-2">
                    <Label>Target segment</Label>
                    <Select value={segmentId} onValueChange={setSegmentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a segment" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>None</SelectItem>
                        {segments.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {triggerType === "manual"
                        ? "Enrolled on demand from this segment."
                        : "Contacts are enrolled as they enter this segment."}
                    </p>
                    {activeSegmentId && (
                      <p className="text-xs font-medium">
                        {segCount === null
                          ? "Counting contacts…"
                          : `≈ ${segCount} contact${segCount === 1 ? "" : "s"} match today.`}
                      </p>
                    )}
                  </div>
                )}
                {triggerType === "stage_change" && (
                  <div className="space-y-2">
                    <Label>Enrol when stage becomes</Label>
                    <Select value={entryStage} onValueChange={setEntryStage}>
                      <SelectTrigger>
                        <SelectValue placeholder="Any stage change" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Any stage change</SelectItem>
                        {LIFECYCLE_STAGES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {LIFECYCLE_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {triggerType === "reply" && (
                  <p className="text-xs text-muted-foreground">
                    Enrolled when the contact replies to any campaign or
                    workflow email.
                  </p>
                )}
                {triggerType === "activity_logged" && (
                  <div className="space-y-2">
                    <Label>Enrol when this activity is logged</Label>
                    <Select
                      value={entryActivity}
                      onValueChange={setEntryActivity}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any activity</SelectItem>
                        {ACTIVITY_TYPES.map((a) => (
                          <SelectItem key={a} value={a}>
                            {a[0].toUpperCase() + a.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {(triggerType === "email_opened" ||
                  triggerType === "email_clicked") && (
                  <p className="text-xs text-muted-foreground">
                    {triggerType === "email_opened"
                      ? "Enrolled when the contact opens a tracked campaign or workflow email."
                      : "Enrolled when the contact clicks a link in a tracked email."}
                  </p>
                )}

                <div className="space-y-3 border-t pt-4">
                  <Label>Exit criteria</Label>
                  <p className="text-xs text-muted-foreground">
                    Stop a contact&rsquo;s run early when a goal is met — no
                    further steps run.
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={exitOnReply}
                      onChange={(e) => setExitOnReply(e.target.checked)}
                    />
                    Exit when the contact replies
                  </label>
                  <div className="space-y-2">
                    <Label className="text-xs font-normal text-muted-foreground">
                      Exit when the contact reaches stage
                    </Label>
                    <Select value={goalStage} onValueChange={setGoalStage}>
                      <SelectTrigger>
                        <SelectValue placeholder="No goal stage" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>No goal stage</SelectItem>
                        {LIFECYCLE_STAGES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {LIFECYCLE_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-normal text-muted-foreground">
                      Exit when the contact joins segment
                    </Label>
                    <Select
                      value={exitSegmentId}
                      onValueChange={setExitSegmentId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="No segment" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>No segment</SelectItem>
                        {segments.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={exitCond !== null}
                      onChange={(e) =>
                        setExitCond(
                          e.target.checked
                            ? {
                                match: "all",
                                rules: [
                                  {
                                    field: "lifecycle_stage",
                                    op: "equals",
                                    value: "",
                                  },
                                ],
                              }
                            : null
                        )
                      }
                    />
                    Exit when the contact matches conditions
                  </label>
                  {exitCond !== null && (
                    <div className="rounded-md border p-2.5">
                      <BranchConfig
                        showPaths={false}
                        cfg={{ match: exitCond.match, rules: exitCond.rules }}
                        onChange={(patch) =>
                          setExitCond({
                            match:
                              (patch.match as "all" | "any") ?? exitCond.match,
                            rules:
                              (patch.rules as BranchRule[]) ?? exitCond.rules,
                          })
                        }
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Send email */}
            {selAction === "send_email" && (
              <>
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input
                    value={String(cfg.subject ?? "")}
                    onChange={(e) =>
                      updateSelectedConfig({ subject: e.target.value })
                    }
                    placeholder="{{first_name}}, a quick idea"
                  />
                  <div className="flex flex-wrap gap-1">
                    <span className="text-xs text-muted-foreground">
                      Insert:
                    </span>
                    {MERGE_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          updateSelectedConfig({
                            subject: `${String(cfg.subject ?? "")}{{${tag}}}`,
                          })
                        }
                        className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
                      >
                        {`{{${tag}}}`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Body</Label>
                  <RichEmailEditor
                    key={`email-${selected?.id}`}
                    value={String(cfg.body ?? "")}
                    onChange={(html) => updateSelectedConfig({ body: html })}
                    emailTemplates={emailTemplates}
                    onApplyTemplate={(snip) =>
                      updateSelectedConfig({ subject: snip.subject })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Personalise with {MERGE_TAGS.map((t) => `{{${t}}}`).join(", ")}.
                  </p>
                </div>
                <div className="space-y-2 border-t pt-4">
                  <Label>Send a test</Label>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={testTo}
                      onChange={(e) => setTestTo(e.target.value)}
                      placeholder="you@example.com"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={testPending}
                      onClick={() =>
                        startTest(async () => {
                          setTestMsg(null);
                          const res = await sendTestWorkflowEmail({
                            subject: String(cfg.subject ?? ""),
                            body: String(cfg.body ?? ""),
                            to: testTo,
                            mailboxId: mailboxId === NONE ? null : mailboxId,
                          });
                          setTestMsg(res.error ?? "Test sent.");
                        })
                      }
                    >
                      <Send className="size-4" />
                      {testPending ? "Sending…" : "Send test"}
                    </Button>
                  </div>
                  {testMsg && (
                    <p className="text-xs text-muted-foreground">{testMsg}</p>
                  )}
                </div>
              </>
            )}

            {/* Wait */}
            {selAction === "wait" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Wait type</Label>
                  <Select
                    value={String(cfg.mode ?? "delay")}
                    onValueChange={(v) => updateSelectedConfig({ mode: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="delay">For a duration</SelectItem>
                      <SelectItem value="until_time">
                        Until a time of day
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {cfg.mode === "until_time" ? (
                  <div className="space-y-2">
                    <Label>Time of day (UTC)</Label>
                    <Input
                      type="time"
                      value={String(cfg.time ?? "09:00")}
                      onChange={(e) =>
                        updateSelectedConfig({ time: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Holds each contact until the next occurrence of this time.
                    </p>
                  </div>
                ) : (
                  <WaitDelayFields
                    key={`wait-${selected?.id}`}
                    minutes={Number(cfg.minutes ?? 0)}
                    onChange={(m) => updateSelectedConfig({ minutes: m })}
                  />
                )}
              </div>
            )}

            {/* Set lifecycle */}
            {selAction === "set_lifecycle" && (
              <div className="space-y-2">
                <Label>Set stage to</Label>
                <Select
                  value={String(cfg.stage ?? "")}
                  onValueChange={(v) => updateSelectedConfig({ stage: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {LIFECYCLE_STAGES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {LIFECYCLE_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Add to segment */}
            {selAction === "add_to_segment" && (
              <div className="space-y-2">
                <Label>Add to segment</Label>
                <Select
                  value={String(cfg.segmentId ?? "")}
                  onValueChange={(v) => updateSelectedConfig({ segmentId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose segment" />
                  </SelectTrigger>
                  <SelectContent>
                    {segments.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Enroll in campaign */}
            {selAction === "enroll_campaign" && (
              <div className="space-y-2">
                <Label>Enroll in campaign</Label>
                <Select
                  value={String(cfg.campaignId ?? "")}
                  onValueChange={(v) => updateSelectedConfig({ campaignId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Adds the contact to this campaign&rsquo;s sequence — same
                  eligibility rules as manual enrolment (skips unsubscribed,
                  suppressed, or already-enrolled contacts).
                </p>
              </div>
            )}

            {/* Move to workflow */}
            {selAction === "move_to_workflow" && (
              <div className="space-y-2">
                <Label>Move to workflow</Label>
                <Select
                  value={String(cfg.workflowId ?? "")}
                  onValueChange={(v) => updateSelectedConfig({ workflowId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose workflow" />
                  </SelectTrigger>
                  <SelectContent>
                    {otherWorkflows.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Transfers the contact into the selected workflow and ends this
                  run — no steps can follow.
                </p>
              </div>
            )}

            {/* End of flow */}
            {selAction === "end_flow" && (
              <p className="text-sm text-muted-foreground">
                Reaching this step ends the contact&rsquo;s run. No steps can be
                added after it.
              </p>
            )}

            {/* Webhook */}
            {selAction === "webhook" && (
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <Input
                  type="url"
                  value={String(cfg.url ?? "")}
                  onChange={(e) => updateSelectedConfig({ url: e.target.value })}
                  placeholder="https://example.com/hooks/handshake"
                />
                <p className="text-xs text-muted-foreground">
                  Sends a POST with the contact&rsquo;s details when a run reaches
                  this step. Must be HTTPS.
                </p>
              </div>
            )}

            {/* Branch / condition */}
            {selAction === "branch" && (
              <BranchConfig cfg={cfg} onChange={updateSelectedConfig} />
            )}

            {selected && (
              <div className="space-y-3 border-t pt-4">
                {errorsForId === selectedId && stepErrors.length > 0 && (
                  <ul className="space-y-1 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                    {stepErrors.map((e) => (
                      <li key={e} className="flex items-start gap-1.5">
                        <AlertCircle className="mt-0.5 size-3 shrink-0" />
                        {e}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={saveStep}>
                    Save step
                  </Button>
                  {selectedId !== "trigger" && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={duplicateSelected}
                      >
                        <Copy className="size-4" />
                        Duplicate
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={removeSelected}
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
          </>
          )}
        </SheetContent>
      </Sheet>
    </form>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

const ACTION_DESC: Record<ActionType, string> = {
  send_email: "Send a templated email",
  wait: "Pause before the next step",
  set_lifecycle: "Change the contact's stage",
  add_to_segment: "Add the contact to a segment",
  enroll_campaign: "Enroll the contact in a campaign",
  move_to_workflow: "Transfer the contact to another workflow",
  branch: "Split the path on a condition",
  webhook: "Call an external webhook",
  end_flow: "End the run — no further steps",
};

function PickRow({
  action,
  icon: Icon,
  onPick,
}: {
  action: ActionType;
  icon: typeof Mail;
  onPick: (a: ActionType) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(action)}
      className="flex w-full items-center gap-3 rounded-md border p-3 text-left text-sm transition-colors hover:bg-accent"
    >
      <Icon className="size-4 text-muted-foreground" />
      <div>
        <p className="font-medium">{ACTION_LABELS[action]}</p>
        <p className="text-xs text-muted-foreground">{ACTION_DESC[action]}</p>
      </div>
    </button>
  );
}

function StepPicker({ onPick }: { onPick: (a: ActionType) => void }) {
  const actions = PALETTE.filter((p) => p.action !== "branch");
  const conditions = PALETTE.filter((p) => p.action === "branch");
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Actions
        </p>
        {actions.map(({ action, icon }) => (
          <PickRow key={action} action={action} icon={icon} onPick={onPick} />
        ))}
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Conditions
        </p>
        {conditions.map(({ action, icon }) => (
          <PickRow key={action} action={action} icon={icon} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

const WAIT_UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440 } as const;
type WaitUnit = keyof typeof WAIT_UNIT_MINUTES;

/** Duration picker for a "wait" step: a value plus a unit, defaulting to days.
 *  Stores the result as minutes so the engine stays unit-agnostic. */
function WaitDelayFields({
  minutes,
  onChange,
}: {
  minutes: number;
  onChange: (minutes: number) => void;
}) {
  const inferUnit: WaitUnit =
    minutes > 0 && minutes % 1440 === 0
      ? "days"
      : minutes > 0 && minutes % 60 === 0
        ? "hours"
        : minutes > 0
          ? "minutes"
          : "days";
  const [unit, setUnit] = React.useState<WaitUnit>(inferUnit);
  const value = Math.max(0, Math.round(minutes / WAIT_UNIT_MINUTES[unit]));

  return (
    <div className="space-y-2">
      <Label>Wait for</Label>
      <div className="flex gap-2">
        <Input
          type="number"
          min={0}
          className="w-28"
          value={String(value)}
          onChange={(e) =>
            onChange(
              Math.max(0, Number(e.target.value) || 0) * WAIT_UNIT_MINUTES[unit]
            )
          }
        />
        <Select
          value={unit}
          onValueChange={(u) => {
            setUnit(u as WaitUnit);
            onChange(value * WAIT_UNIT_MINUTES[u as WaitUnit]);
          }}
        >
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="days">Days</SelectItem>
            <SelectItem value="hours">Hours</SelectItem>
            <SelectItem value="minutes">Minutes</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        Delay before the next step runs.
      </p>
    </div>
  );
}

type BranchRule = { field: string; op: Operator; value?: string };

function normalizeRules(cfg: Record<string, unknown>): BranchRule[] {
  if (Array.isArray(cfg.rules)) return cfg.rules as BranchRule[];
  // Migrate a legacy single-rule branch on first edit.
  if (typeof cfg.field === "string") {
    return [
      {
        field: cfg.field,
        op: (cfg.op as Operator) ?? "equals",
        value: typeof cfg.value === "string" ? cfg.value : "",
      },
    ];
  }
  return [{ field: "lifecycle_stage", op: "equals", value: "" }];
}

function BranchConfig({
  cfg,
  onChange,
  showPaths = true,
}: {
  cfg: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  showPaths?: boolean;
}) {
  const rules = normalizeRules(cfg);
  const match = cfg.match === "any" ? "any" : "all";

  const setRules = (next: BranchRule[]) =>
    onChange({ match, rules: next, field: undefined, op: undefined, value: undefined });

  const updateRule = (i: number, patch: Partial<BranchRule>) =>
    setRules(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      {showPaths && (
        <p className="text-sm text-muted-foreground">
          If a contact matches, the <strong>Yes</strong> path runs; otherwise
          the <strong>No</strong> path. Connect each handle to a step.
        </p>
      )}
      {rules.length > 1 && (
        <div className="space-y-2">
          <Label>Match</Label>
          <Select
            value={match}
            onValueChange={(v) => onChange({ match: v, rules })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All conditions (AND)</SelectItem>
              <SelectItem value="any">Any condition (OR)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {rules.map((rule, i) => {
        const def = fieldDef(rule.field);
        const kind = def?.kind ?? "text";
        const showValue = !VALUELESS_OPS.includes(rule.op);
        return (
          <div key={i} className="space-y-2 rounded-md border p-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Condition {i + 1}
              </Label>
              {rules.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRules(rules.filter((_, idx) => idx !== i))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remove condition"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
            <Select
              value={rule.field}
              onValueChange={(v) => {
                const k = fieldDef(v)?.kind ?? "text";
                updateRule(i, { field: v, op: OPERATORS_FOR_KIND[k][0], value: "" });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEGMENT_FIELDS.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={rule.op}
              onValueChange={(v) =>
                updateRule(i, {
                  op: v as Operator,
                  value: VALUELESS_OPS.includes(v as Operator) ? undefined : rule.value ?? "",
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATORS_FOR_KIND[kind].map((o) => (
                  <SelectItem key={o} value={o}>
                    {OPERATOR_LABELS[o]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {showValue &&
              (kind === "enum" ? (
                <Select
                  value={String(rule.value ?? "")}
                  onValueChange={(v) => updateRule(i, { value: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(def?.options ?? []).map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={String(rule.value ?? "")}
                  onChange={(e) => updateRule(i, { value: e.target.value })}
                />
              ))}
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          setRules([...rules, { field: "lifecycle_stage", op: "equals", value: "" }])
        }
      >
        <Plus className="size-4" /> Add condition
      </Button>
    </div>
  );
}
