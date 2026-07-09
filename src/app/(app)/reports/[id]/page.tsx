import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireContext } from "@/lib/context";
import { Badge } from "@/components/ui/badge";
import { CampaignPerformance } from "@/components/campaign-performance";
import { computeFunnel, type EventLite, type StepInfo } from "@/lib/funnel";
import type { Campaign } from "@/lib/types";

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
      <Link
        href="/reports/campaigns"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to reports
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
          <Badge variant="secondary">{c.status}</Badge>
        </div>
        <Link
          href={`/campaigns/${c.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          Open campaign <ExternalLink className="size-4" />
        </Link>
      </div>

      <CampaignPerformance funnel={funnel} enrolled={enrolled ?? 0} />
    </div>
  );
}
