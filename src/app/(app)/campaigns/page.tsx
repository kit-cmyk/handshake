import Link from "next/link";
import { Plus, Send } from "lucide-react";
import { requireContext } from "@/lib/context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { CampaignsTable, type CampaignRow } from "./campaigns-table";
import type { Campaign } from "@/lib/types";

export default async function CampaignsPage() {
  const { supabase, org } = await requireContext();

  const [{ data: campaigns }, { data: steps }, { data: enrollments }] =
    await Promise.all([
      supabase
        .from("campaigns")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false }),
      supabase.from("campaign_steps").select("campaign_id").eq("org_id", org.id),
      supabase
        .from("campaign_enrollments")
        .select("campaign_id")
        .eq("org_id", org.id),
    ]);

  const list = (campaigns ?? []) as Campaign[];
  const stepCount = new Map<string, number>();
  for (const s of steps ?? []) {
    const id = (s as { campaign_id: string }).campaign_id;
    stepCount.set(id, (stepCount.get(id) ?? 0) + 1);
  }
  const enrollCount = new Map<string, number>();
  for (const e of enrollments ?? []) {
    const id = (e as { campaign_id: string }).campaign_id;
    enrollCount.set(id, (enrollCount.get(id) ?? 0) + 1);
  }

  const rows: CampaignRow[] = list.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    steps: stepCount.get(c.id) ?? 0,
    enrolled: enrollCount.get(c.id) ?? 0,
    updated_at: c.updated_at,
    hasSegment: !!c.segment_id,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Multi-step outreach sequences.
          </p>
        </div>
        <Button asChild>
          <Link href="/campaigns/new">
            <Plus className="size-4" /> New campaign
          </Link>
        </Button>
      </div>

      {rows.length ? (
        <CampaignsTable data={rows} />
      ) : (
        <EmptyState
          icon={Send}
          title="Your outbox is quiet"
          description="Build a sequence, target a segment, and start landing in inboxes. Your first campaign is a few clicks away."
        >
          <Button asChild>
            <Link href="/campaigns/new">
              <Plus className="size-4" /> New campaign
            </Link>
          </Button>
        </EmptyState>
      )}
    </div>
  );
}
