import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/lib/context";
import { ProspectForm } from "./prospect-form";
import { ProspectHistoryTable } from "./prospect-history-table";
import { DataHealthCallout } from "@/components/data-health-callout";
import { detectIssues, summarize } from "@/lib/data-quality";
import type { ContactWithCompany, ScrapeJob } from "@/lib/types";

export default async function ProspectPage() {
  const { supabase, org } = await requireContext();

  const [{ data: jobs }, { data: contacts }] = await Promise.all([
    supabase
      .from("scrape_jobs")
      .select("*")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("contacts")
      .select("*, companies(id, name)")
      .eq("org_id", org.id),
  ]);

  const history = (jobs ?? []) as ScrapeJob[];
  const issues = summarize(
    detectIssues((contacts ?? []) as ContactWithCompany[])
  );

  return (
    <div className="space-y-6">
      <Link
        href="/contacts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to contacts
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Find leads</h1>
        <p className="text-sm text-muted-foreground">
          Search local businesses by industry and location, or find people by
          role and company — reviewed and imported straight into your CRM.
        </p>
      </div>

      <ProspectForm />

      <DataHealthCallout summary={issues} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent searches</h2>
        <ProspectHistoryTable data={history} />
      </section>
    </div>
  );
}
