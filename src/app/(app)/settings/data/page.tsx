import { requireContext } from "@/lib/context";
import { DATASETS, COUNTED_TABLES } from "@/lib/data-erasure";
import { DataManager, type DataCounts } from "../data-manager";

export default async function DataSettingsPage() {
  const { supabase, org } = await requireContext();
  const canManage = org.role === "owner" || org.role === "admin";

  // One head-count per table, then summed per dataset — a dataset can span
  // several tables (import history), and several datasets can share one.
  const rows = await Promise.all(
    COUNTED_TABLES.map(async (table) => {
      const { count } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("org_id", org.id);
      return [table, count ?? 0] as const;
    })
  );
  const byTable = Object.fromEntries(rows) as Record<string, number>;

  const counts: DataCounts = Object.fromEntries(
    DATASETS.map((d) => [
      d.key,
      d.countTables.reduce((sum, t) => sum + (byTable[t] ?? 0), 0),
    ])
  );

  return (
    <DataManager
      counts={counts}
      canManage={canManage}
      workspaceName={org.name}
    />
  );
}
