import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { requireContext } from "@/lib/context";
import { Badge } from "@/components/ui/badge";
import { CampaignPerformance } from "@/components/campaign-performance";
import { computeFunnel, type EventLite, type StepInfo } from "@/lib/funnel";
import type { Campaign } from "@/lib/types";
import { statusLabel } from "@/lib/utils";

export default async function CampaignReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, org } = await requireContext();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();
  if (!campaign) notFound();
  const c = campaign as Campaign;

  const [{ data: steps }, { data: events }, { count: enrolled }] =
    await Promise.all([
      supabase
        .from("campaign_steps")
        .select("id, position, subject")
        .eq("campaign_id", id)
        .order("position", { ascending: true }),
      supabase
        .from("events")
        .select("campaign_step_id, contact_id, type")
        .eq("org_id", org.id)
        .eq("campaign_id", id),
      supabase
        .from("campaign_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id),
    ]);

  const funnel = computeFunnel(
    (steps ?? []) as StepInfo[],
    (events ?? []) as EventLite[]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        back="reports"
        title={c.name}
        badge={<Badge variant="secondary">{statusLabel(c.status)}</Badge>}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/campaigns/${c.id}`}>
              Open campaign <ExternalLink className="size-4" />
            </Link>
          </Button>
        }
      />

      <CampaignPerformance funnel={funnel} enrolled={enrolled ?? 0} />
    </div>
  );
}
