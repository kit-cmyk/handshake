import Link from "next/link";
import { Plus, Workflow as WorkflowIcon } from "lucide-react";
import { requireContext } from "@/lib/context";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { WorkflowsTable, type WorkflowRow } from "./workflows-table";
import { TRIGGER_LABELS, type Workflow } from "@/lib/workflows";

export default async function WorkflowsPage() {
  const { supabase, org } = await requireContext();

  const [{ data: workflows }, { data: runs }] = await Promise.all([
    supabase
      .from("workflows")
      .select("*")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("workflow_runs")
      .select("workflow_id, status")
      .eq("org_id", org.id),
  ]);

  const list = (workflows ?? []) as Workflow[];
  const activeRuns = new Map<string, number>();
  for (const r of runs ?? []) {
    const row = r as { workflow_id: string; status: string };
    if (row.status === "active")
      activeRuns.set(row.workflow_id, (activeRuns.get(row.workflow_id) ?? 0) + 1);
  }

  const rows: WorkflowRow[] = list.map((w) => ({
    id: w.id,
    name: w.name,
    status: w.status,
    trigger: TRIGGER_LABELS[w.trigger_type].split(" — ")[0],
    activeRuns: activeRuns.get(w.id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Trigger-based automations.
          </p>
        </div>
        <Button asChild>
          <Link href="/workflows/new">
            <Plus className="size-4" /> New workflow
          </Link>
        </Button>
      </div>

      {rows.length ? (
        <WorkflowsTable data={rows} />
      ) : (
        <EmptyState
          icon={WorkflowIcon}
          title="No robots on duty"
          description="Put your follow-up on autopilot: when a contact enters a segment, fire off a sequence of actions — hands-free."
        >
          <Link href="/workflows/new" className={buttonVariants()}>
            <Plus className="size-4" /> New workflow
          </Link>
        </EmptyState>
      )}
    </div>
  );
}
