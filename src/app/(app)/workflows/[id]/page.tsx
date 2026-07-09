import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { requireContext } from "@/lib/context";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WorkflowStatusMenu } from "./workflow-status-menu";
import { WorkflowActions } from "./workflow-actions";
import { WorkflowTabs } from "./workflow-tabs";
import { WorkflowSteps, type StepItem } from "./workflow-steps";
import {
  parseGraph,
  parseExitConfig,
  describeAction,
  describeTrigger,
  describeExit,
  TRIGGER_LABELS,
  ACTION_LABELS,
  type Workflow,
  type WorkflowStatus,
  type WorkflowGraph,
} from "@/lib/workflows";
import {
  computeWorkflowReport,
  type RunLite,
  type RunStepLite,
} from "@/lib/workflow-report";

const STATUS_VARIANT: Record<
  WorkflowStatus,
  "secondary" | "success" | "warning" | "outline" | "destructive"
> = {
  draft: "secondary",
  running: "success",
  paused: "warning",
  ended: "destructive",
};

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b pb-2 text-sm last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

/** Nodes in trigger-first breadth-first order; any unreached nodes trail after. */
function orderedNodes(graph: WorkflowGraph) {
  const trigger = graph.nodes.find((n) => n.data?.kind === "trigger");
  const start = trigger?.id ?? graph.nodes[0]?.id;
  const seen = new Set<string>();
  const order: typeof graph.nodes = [];
  const queue: string[] = [];
  if (start) {
    queue.push(start);
    seen.add(start);
  }
  while (queue.length) {
    const cur = queue.shift()!;
    const node = graph.nodes.find((n) => n.id === cur);
    if (node) order.push(node);
    for (const e of graph.edges.filter((e) => e.source === cur)) {
      if (!seen.has(e.target)) {
        seen.add(e.target);
        queue.push(e.target);
      }
    }
  }
  for (const n of graph.nodes) if (!seen.has(n.id)) order.push(n);
  return order;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardHeader>
    </Card>
  );
}

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, org } = await requireContext();

  const { data: workflow } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", id)
    .single();
  if (!workflow) notFound();

  const w = {
    ...workflow,
    graph: parseGraph(workflow.graph),
    exit_config: parseExitConfig(workflow.exit_config),
  } as Workflow;

  const [{ data: runs }, { data: segments }, { data: campaigns }, { data: wfs }, mailboxRow] =
    await Promise.all([
      supabase.from("workflow_runs").select("id, status").eq("workflow_id", id),
      supabase.from("segments").select("id, name").eq("org_id", org.id),
      supabase.from("campaigns").select("id, name").eq("org_id", org.id),
      supabase.from("workflows").select("id, name").eq("org_id", org.id),
      w.mailbox_id
        ? supabase
            .from("mailboxes")
            .select("display_name, email")
            .eq("id", w.mailbox_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const runRows = (runs ?? []) as { id: string; status: string }[];
  const runIds = runRows.map((r) => r.id);
  let runSteps: RunStepLite[] = [];
  if (runIds.length) {
    const { data } = await supabase
      .from("workflow_run_steps")
      .select("node_id, status, entered_at, completed_at")
      .in("run_id", runIds);
    runSteps = (data ?? []) as RunStepLite[];
  }

  const report = computeWorkflowReport(w.graph, runRows as RunLite[], runSteps);

  // Name resolvers for step descriptions.
  const segById = new Map(
    ((segments ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name])
  );
  const campById = new Map(
    ((campaigns ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name])
  );
  const wfById = new Map(
    ((wfs ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name])
  );
  const nameCtx = {
    segmentName: (sid: string) => segById.get(sid) ?? "segment",
    campaignName: (cid: string) => campById.get(cid) ?? "campaign",
    workflowName: (wid: string) => wfById.get(wid) ?? "workflow",
  };

  const triggerConfig = (w.trigger_config ?? {}) as {
    segmentId?: string;
    activityType?: string;
  };

  // Ordered step summary (trigger first).
  const steps: StepItem[] = orderedNodes(w.graph).map((n) => {
    if (n.data?.kind === "trigger") {
      return {
        id: n.id,
        action: null,
        title: "Trigger",
        subtitle: describeTrigger(w.trigger_type, {
          segmentId: triggerConfig.segmentId,
          segmentName: nameCtx.segmentName,
          activityType: triggerConfig.activityType,
        }),
      };
    }
    const action = n.data.action!;
    return {
      id: n.id,
      action,
      title: ACTION_LABELS[action],
      subtitle: describeAction(action, n.data.config ?? {}, nameCtx),
    };
  });
  const actionCount = steps.filter((s) => s.action !== null).length;

  const mailbox = mailboxRow?.data as
    | { display_name: string | null; email: string }
    | null;
  const mailboxName = mailbox
    ? mailbox.display_name || mailbox.email
    : "Default sender";

  const exitLines = describeExit(w.exit_config, {
    segmentName: nameCtx.segmentName,
  });

  const usesSegment =
    w.trigger_type === "manual" || w.trigger_type === "segment_entry";
  const canEnroll = usesSegment && !!triggerConfig.segmentId;

  // Configuration problems that would keep this workflow from running.
  const warnings: string[] = [];
  if (w.status === "draft") {
    warnings.push(
      "This workflow is a draft. Set it live from the status menu so its trigger starts enrolling contacts."
    );
  }
  if (w.trigger_type === "segment_entry" && !triggerConfig.segmentId) {
    warnings.push(
      "This segment-entry workflow has no target segment. Edit it and choose one, or no one will be enrolled."
    );
  }
  if (actionCount === 0) {
    warnings.push(
      "This workflow has no steps yet. Edit it to add actions after the trigger."
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/workflows"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to workflows
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{w.name}</h1>
          <Badge variant={STATUS_VARIANT[w.status]}>{w.status}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <WorkflowStatusMenu
            workflowId={w.id}
            status={w.status}
            canEnroll={canEnroll}
          />
          <WorkflowActions workflowId={w.id} />
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
          {warnings.map((warn) => (
            <p
              key={warn}
              className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{warn}</span>
            </p>
          ))}
        </div>
      )}

      <WorkflowTabs
        overview={
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <SummaryRow label="Name" value={w.name} />
                <SummaryRow label="Send from" value={mailboxName} />
                <SummaryRow
                  label="Trigger"
                  value={TRIGGER_LABELS[w.trigger_type].split(" — ")[0]}
                />
                <SummaryRow
                  label="Exit criteria"
                  value={exitLines.length ? exitLines.join(" · ") : "None"}
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  {report.runs.total === 0 ? (
                    <span className="text-sm text-muted-foreground">
                      No runs yet.
                    </span>
                  ) : (
                    <>
                      <Badge variant="secondary">{report.runs.active} active</Badge>
                      <Badge variant="secondary">
                        {report.runs.completed} completed
                      </Badge>
                      {report.runs.stopped > 0 && (
                        <Badge variant="secondary">
                          {report.runs.stopped} stopped
                        </Badge>
                      )}
                      {report.runs.failed > 0 && (
                        <Badge variant="secondary">
                          {report.runs.failed} failed
                        </Badge>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Steps · {actionCount} action{actionCount === 1 ? "" : "s"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <WorkflowSteps steps={steps} />
              </CardContent>
            </Card>
          </>
        }
        performance={
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Total runs" value={report.runs.total} />
              <Stat label="Active" value={report.runs.active} />
              <Stat label="Completed" value={report.runs.completed} />
              <Stat
                label="Stopped / failed"
                value={report.runs.stopped + report.runs.failed}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Per-step performance</CardTitle>
              </CardHeader>
              <CardContent>
                {report.nodes.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Step</TableHead>
                        <TableHead>Entered</TableHead>
                        <TableHead>Completed</TableHead>
                        <TableHead>Completion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.nodes.map((n) => (
                        <TableRow key={n.nodeId}>
                          <TableCell className="font-medium">{n.label}</TableCell>
                          <TableCell>{n.entered}</TableCell>
                          <TableCell>
                            {n.completed}
                            {n.failed > 0 && (
                              <span className="ml-1 text-xs text-destructive">
                                ({n.failed} failed)
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-24 overflow-hidden rounded bg-muted">
                                <div
                                  className="h-full bg-sky-500"
                                  style={{ width: `${n.completionRate}%` }}
                                />
                              </div>
                              <span className="tabular-nums text-xs">
                                {n.completionRate}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No action steps to report on.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        }
      />
    </div>
  );
}
