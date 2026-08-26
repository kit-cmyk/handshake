import { requireContext } from "@/lib/context";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { DESTINATIONS } from "@/lib/nav";
import { LeadSearch } from "./lead-search";
import { SearchHistoryTable } from "./search-history-table";
import { DataHealthCallout } from "@/components/data-health-callout";
import { detectIssues, summarize } from "@/lib/data-quality";
import type { ContactWithCompany, ScrapeJob } from "@/lib/types";

export default async function LeadsPage() {
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

  const stats = [
    { label: "Searches run", value: history.length },
    {
      label: "Businesses added",
      value: history.reduce((n, j) => n + (j.imported ?? 0), 0),
    },
    {
      label: "Contacts created",
      value: history.reduce((n, j) => n + (j.contacts ?? 0), 0),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={DESTINATIONS.leads.label}
        description={DESTINATIONS.leads.description}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-2xl font-bold tracking-tight tabular-nums">
              {s.value.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </Card>
        ))}
      </div>

      <LeadSearch />

      <DataHealthCallout summary={issues} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent searches</h2>
        <SearchHistoryTable data={history} />
      </section>
    </div>
  );
}
