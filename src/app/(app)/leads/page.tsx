import { requireContext } from "@/lib/context";
import { StatTile } from "@/components/stat-tile";
import { PageHeader } from "@/components/page-header";
import { DESTINATIONS } from "@/lib/nav";
import { LeadSearch } from "./lead-search";
import { SearchHistoryTable } from "./search-history-table";
import { DataHealthCallout } from "@/components/data-health-callout";
import { detectIssues, summarize } from "@/lib/data-quality";
import { fetchAllRows } from "@/lib/supabase/paginate";
import type { ContactWithCompany, ScrapeJob } from "@/lib/types";

export default async function LeadsPage() {
  const { supabase, org } = await requireContext();

  const [{ data: jobs }, contacts] = await Promise.all([
    supabase
      .from("scrape_jobs")
      .select("*")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false })
      .limit(200),
    // detectIssues finds duplicates, so it genuinely needs every contact — but
    // this read used to be an unpaged `select("*")`, which PostgREST silently
    // caps at 1000 rows with no error. Past a thousand contacts the health
    // summary was quietly describing an arbitrary subset. Page it, and select
    // only the columns the detector actually reads rather than whole rows.
    fetchAllRows<ContactWithCompany>((from, to) =>
      supabase
        .from("contacts")
        .select(
          "id, first_name, last_name, email, phone, dismissed_issues, companies(id, name)"
        )
        .eq("org_id", org.id)
        // `id` is a tiebreaker so a row can't be dropped or repeated across
        // page boundaries.
        .order("id")
        .range(from, to)
    ),
  ]);

  const history = (jobs ?? []) as ScrapeJob[];
  const issues = summarize(detectIssues(contacts));

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
          <StatTile key={s.label} label={s.label} value={s.value} />
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
