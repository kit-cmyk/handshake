import { requireContext } from "@/lib/context";
import { WorkflowReportTable } from "../reports-tables";
import { ReportsNav } from "../reports-nav";
import { pct } from "@/lib/funnel";
import type { Workflow } from "@/lib/workflows";

export default async function WorkflowReportsPage() {
  const { supabase, org } = await requireContext();

  const [{ data: workflows }, { data: wfRuns }] = await Promise.all([
    supabase
      .from("workflows")
      .select("id, name, status")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("workflow_runs")
      .select("workflow_id, status")
      .eq("org_id", org.id),
  ]);

  const wfList = (workflows ?? []) as Pick<Workflow, "id" | "name" | "status">[];
  const wfTotal = new Map<string, number>();
  const wfCompleted = new Map<string, number>();
  for (const r of wfRuns ?? []) {
    const row = r as { workflow_id: string; status: string };
    wfTotal.set(row.workflow_id, (wfTotal.get(row.workflow_id) ?? 0) + 1);
    if (row.status === "completed")
      wfCompleted.set(
        row.workflow_id,
        (wfCompleted.get(row.workflow_id) ?? 0) + 1
      );
  }
  const wfRows = wfList.map((w) => {
    const total = wfTotal.get(w.id) ?? 0;
    const completed = wfCompleted.get(w.id) ?? 0;
    return { ...w, total, completed, completionRate: pct(completed, total) };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Automation completion rates across your workflows.
        </p>
      </div>

      <ReportsNav />

      <WorkflowReportTable data={wfRows} />
    </div>
  );
}
