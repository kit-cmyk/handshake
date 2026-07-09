import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/lib/context";
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
      <Link
        href="/contacts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to contacts
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import contacts</h1>
        <p className="text-sm text-muted-foreground">
          Upload a CSV of contacts or companies — map columns, dedupe, and import.
        </p>
      </div>

      <ImportWizard />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent imports</h2>
        <ImportHistoryTable data={history} />
      </section>
    </div>
  );
}
