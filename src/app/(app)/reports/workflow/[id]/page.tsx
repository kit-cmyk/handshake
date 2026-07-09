import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireContext } from "@/lib/context";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseGraph } from "@/lib/workflows";
import {
  computeWorkflowReport,
  type RunLite,
  type RunStepLite,
} from "@/lib/workflow-report";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export default async function WorkflowReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireContext();

  const { data: workflow } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", id)
    .single();
  if (!workflow) notFound();

  const { data: runs } = await supabase
    .from("workflow_runs")
    .select("id, status")
    .eq("workflow_id", id);

  const runIds = (runs ?? []).map((r) => (r as { id: string }).id);
  let steps: RunStepLite[] = [];
  if (runIds.length) {
    const { data } = await supabase
      .from("workflow_run_steps")
      .select("node_id, status, entered_at, completed_at")
      .in("run_id", runIds);
    steps = (data ?? []) as RunStepLite[];
  }

  const report = computeWorkflowReport(
    parseGraph(workflow.graph),
    (runs ?? []) as RunLite[],
    steps
  );

  // Bottleneck = reached node with the lowest completion rate.
  const reached = report.nodes.filter((n) => n.entered > 0);
  const bottleneck =
    reached.length > 0
      ? reached.reduce((lo, n) =>
          n.completionRate < lo.completionRate ? n : lo
        )
      : null;

  return (
    <div className="space-y-6">
      <Link
        href="/reports/workflows"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to reports
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{workflow.name}</h1>
          <Badge variant="secondary">{workflow.status}</Badge>
        </div>
        <Link
          href={`/workflows/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          Open workflow <ExternalLink className="size-4" />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total runs" value={report.runs.total} />
        <Stat label="Active" value={report.runs.active} />
        <Stat label="Completed" value={report.runs.completed} />
        <Stat
          label="Stopped / failed"
          value={report.runs.stopped + report.runs.failed}
        />
      </div>

      {bottleneck && report.runs.total > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Biggest drop-off: <span className="font-medium">{bottleneck.label}</span>{" "}
          — only {bottleneck.completionRate}% of contacts who reached it completed
          it.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-step performance</CardTitle>
          <CardDescription>
            How contacts move through each action.
          </CardDescription>
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
                  <TableHead>Avg time-in-step</TableHead>
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
                    <TableCell className="text-muted-foreground">
                      {n.avgMinutes === null
                        ? "—"
                        : n.avgMinutes < 60
                          ? `${n.avgMinutes}m`
                          : `${Math.round((n.avgMinutes / 60) * 10) / 10}h`}
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
  );
}
