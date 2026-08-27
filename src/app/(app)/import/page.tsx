import { requireContext } from "@/lib/context";
import { PageHeader } from "@/components/page-header";
import { NavButton } from "@/components/nav-button";
import { DESTINATIONS } from "@/lib/nav";
import { ImportWizard } from "./import-wizard";
import { ImportHistoryTable } from "./import-history-table";
import type { ImportBatch } from "@/lib/types";

export default async function ImportPage() {
  const { supabase, org } = await requireContext();

  const { data: batches } = await supabase
    .from("import_batches")
    .select("*")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const history = (batches ?? []) as ImportBatch[];

  return (
    <div className="space-y-6">
      <PageHeader
        back="contacts"
        title="Import contacts"
        description={DESTINATIONS.import.description}
        actions={<NavButton to="leads" />}
      />

      <ImportWizard />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent imports</h2>
        <ImportHistoryTable data={history} />
      </section>
    </div>
  );
}
