import { requireContext } from "@/lib/context";
import { CampaignReportTable } from "../reports-tables";
import { PageHeader } from "@/components/page-header";
import { DESTINATIONS } from "@/lib/nav";
import { ReportsNav } from "../reports-nav";
import { computeFunnel, pct, type EventLite } from "@/lib/funnel";
import type { Campaign } from "@/lib/types";

export default async function CampaignReportsPage() {
  const { supabase, org } = await requireContext();

  const [{ data: campaigns }, { data: events }, { data: enrollments }] =
    await Promise.all([
      supabase
        .from("campaigns")
        .select("id, name, status")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("events")
        .select("campaign_id, campaign_step_id, contact_id, type")
        .eq("org_id", org.id),
      supabase
        .from("campaign_enrollments")
        .select("campaign_id")
        .eq("org_id", org.id),
    ]);

  const list = (campaigns ?? []) as Pick<Campaign, "id" | "name" | "status">[];

  const eventsByCampaign = new Map<string, EventLite[]>();
  for (const e of events ?? []) {
    const row = e as { campaign_id: string | null } & EventLite;
    if (!row.campaign_id) continue;
    (eventsByCampaign.get(row.campaign_id) ??
      eventsByCampaign.set(row.campaign_id, []).get(row.campaign_id)!).push(row);
  }
  const enrolledByCampaign = new Map<string, number>();
  for (const e of enrollments ?? []) {
    const id = (e as { campaign_id: string }).campaign_id;
    enrolledByCampaign.set(id, (enrolledByCampaign.get(id) ?? 0) + 1);
  }

  const rows = list.map((c) => {
    const totals = computeFunnel([], eventsByCampaign.get(c.id) ?? []).totals;
    return {
      ...c,
      enrolled: enrolledByCampaign.get(c.id) ?? 0,
      sent: totals.sent,
      openRate: pct(totals.opened, totals.sent),
      replyRate: pct(totals.replied, totals.sent),
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={DESTINATIONS.reports.label}
        description="Campaign funnel performance across your outreach."
      />

      <ReportsNav />

      <CampaignReportTable data={rows} />
    </div>
  );
}
