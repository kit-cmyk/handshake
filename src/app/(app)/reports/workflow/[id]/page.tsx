import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { requireContext } from "@/lib/context";
import { fetchAllRows } from "@/lib/supabase/paginate";
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
import { FlowSankey } from "@/components/flow-sankey";
import { parseGraph } from "@/lib/workflows";
import { statusLabel } from "@/lib/utils";
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

  // This report needs the raw step rows, not counts: it averages time-in-step
  // from entered_at/completed_at, and the flow chart follows each run's steps in
  // the order they were entered. So page past PostgREST's 1000-row cap rather
  // than aggregating — bounded by this one workflow's runs, not the whole org.
  // Steps are filtered through an embedded inner join on their run's workflow;
  // collecting run ids first and passing them to .in() put every id in the query
  // string, which breaks on a workflow with many runs.
  const [runs, steps] = await Promise.all([
    fetchAllRows<RunLite>((from, to) =>
      supabase
        .from("workflow_runs")
        .select("id, status")
        .eq("workflow_id", id)
        .order("id")
        .range(from, to)
    ),
    fetchAllRows<RunStepLite>((from, to) =>
      supabase
        .from("workflow_run_steps")
        .select(
          "run_id, node_id, status, entered_at, completed_at, workflow_runs!inner(workflow_id)"
        )
        .eq("workflow_runs.workflow_id", id)
        .order("id")
        .range(from, to)
    ),
  ]);

  const report = computeWorkflowReport(parseGraph(workflow.graph), runs, steps);

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
      <PageHeader
        back="reports"
        title={workflow.name}
        badge={<Badge variant="secondary">{statusLabel(workflow.status)}</Badge>}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/workflows/${id}`}>
              Open workflow <ExternalLink className="size-4" />
            </Link>
          </Button>
        }
      />

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
          <CardTitle className="text-base">How contacts move through</CardTitle>
          <CardDescription>
            Built from the routes runs actually took, not from how the canvas is
            wired — so a branch shows the split it really produced. Ribbon width
            is contacts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FlowSankey
            flow={report.flow}
            empty="No runs yet. Enroll contacts and the flow shows the paths they take."
          />
        </CardContent>
      </Card>

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
