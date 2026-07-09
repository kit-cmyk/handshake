import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { requireContext } from "@/lib/context";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CampaignStatusMenu } from "../campaign-status-menu";
import { CampaignActions } from "./campaign-actions";
import { CampaignSequence, type SequenceStep } from "./campaign-sequence";
import { CampaignTabs } from "./campaign-tabs";
import { CampaignPerformance } from "@/components/campaign-performance";
import { computeFunnel, type EventLite, type StepInfo } from "@/lib/funnel";
import {
  type Campaign,
  type CampaignStep,
  type CampaignStatus,
  type EnrollmentStatus,
} from "@/lib/types";

const STATUS_VARIANT: Record<
  CampaignStatus,
  "secondary" | "success" | "warning" | "outline" | "destructive"
> = {
  draft: "secondary",
  active: "success",
  paused: "warning",
  archived: "outline",
  ended: "destructive",
};

/** "3 days" / "2 hours" / "45 minutes" — used in the sending-time summary. */
function humanizeMinutes(m: number): string {
  if (m % 1440 === 0) {
    const d = m / 1440;
    return `${d} day${d === 1 ? "" : "s"}`;
  }
  if (m % 60 === 0) {
    const h = m / 60;
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  return `${m} minute${m === 1 ? "" : "s"}`;
}

function sendingLabel(c: Campaign): string {
  if (c.scheduled_at)
    return `Scheduled for ${new Date(c.scheduled_at).toLocaleString()}`;
  if (c.send_delay_minutes > 0)
    return `${humanizeMinutes(c.send_delay_minutes)} after enrollment`;
  return "Immediately on enrollment";
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b pb-2 text-sm last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireContext();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();
  if (!campaign) notFound();
  const c = campaign as Campaign;

  const [
    { data: steps },
    { data: enrollments },
    { data: events },
    segmentRow,
    audienceRow,
    mailboxRow,
  ] = await Promise.all([
    supabase
      .from("campaign_steps")
      .select("*")
      .eq("campaign_id", id)
      .order("position", { ascending: true }),
    supabase.from("campaign_enrollments").select("status").eq("campaign_id", id),
    supabase
      .from("events")
      .select("campaign_step_id, contact_id, type")
      .eq("campaign_id", id),
    c.segment_id
      ? supabase
          .from("segments")
          .select("name, type")
          .eq("id", c.segment_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    c.segment_id
      ? supabase
          .from("segment_members")
          .select("contact_id", { count: "exact", head: true })
          .eq("segment_id", c.segment_id)
      : Promise.resolve({ count: 0 }),
    c.mailbox_id
      ? supabase
          .from("mailboxes")
          .select("display_name, email")
          .eq("id", c.mailbox_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const stepList = (steps ?? []) as CampaignStep[];
  const eventList = (events ?? []) as EventLite[];

  // Enrollment status breakdown.
  const enrollByStatus = new Map<EnrollmentStatus, number>();
  for (const e of enrollments ?? []) {
    const s = (e as { status: EnrollmentStatus }).status;
    enrollByStatus.set(s, (enrollByStatus.get(s) ?? 0) + 1);
  }
  const totalEnrolled = (enrollments ?? []).length;

  // Sends per step (for the sequence view).
  const sentByStep = new Map<string, number>();
  for (const ev of eventList) {
    if (ev.type !== "sent") continue;
    const sid = ev.campaign_step_id;
    if (sid) sentByStep.set(sid, (sentByStep.get(sid) ?? 0) + 1);
  }

  const funnel = computeFunnel(
    stepList.map((s) => ({
      id: s.id,
      position: s.position,
      subject: s.subject,
    })) as StepInfo[],
    eventList
  );

  const segment = segmentRow?.data as { name: string; type: string } | null;
  const segmentName = segment?.name;
  const audienceCount = (audienceRow as { count: number | null }).count ?? 0;
  const mailbox = mailboxRow?.data as
    | { display_name: string | null; email: string }
    | null;
  const mailboxName = mailbox
    ? mailbox.display_name || mailbox.email
    : "Default sender";

  const audienceValue =
    c.audience_mode === "segment"
      ? `${segmentName ?? "No segment"}${
          c.segment_id ? ` · ${audienceCount}` : ""
        }`
      : `${audienceCount} ${
          c.audience_mode === "import" ? "imported" : "selected"
        } contact${audienceCount === 1 ? "" : "s"}`;

  const sequenceSteps: SequenceStep[] = stepList.map((s) => ({
    id: s.id,
    subject: s.subject ?? "",
    body: s.body ?? "",
    wait_minutes: s.wait_minutes,
    sent: sentByStep.get(s.id) ?? 0,
  }));

  // Configuration problems that would prevent this campaign from running.
  const warnings: string[] = [];
  if (c.status === "draft") {
    warnings.push(
      "This campaign is a draft. Open the status menu and choose Run to enroll its audience and start sending."
    );
  }
  if (!c.segment_id) {
    warnings.push(
      "This campaign has no audience, so there is nothing to enroll. Edit it to add one, or enroll contacts into it from a workflow."
    );
  }

  const statusEntries: EnrollmentStatus[] = [
    "active",
    "completed",
    "replied",
    "bounced",
    "unsubscribed",
    "stopped",
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to campaigns
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
          <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <CampaignStatusMenu
            campaignId={c.id}
            status={c.status}
            hasSegment={!!c.segment_id}
            audienceCount={audienceCount}
          />
          <CampaignActions campaignId={c.id} />
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
          {warnings.map((w) => (
            <p
              key={w}
              className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{w}</span>
            </p>
          ))}
        </div>
      )}

      <CampaignTabs
        overview={
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <SummaryRow label="Name" value={c.name} />
                <SummaryRow label="Send from" value={mailboxName} />
                <SummaryRow label="Audience" value={audienceValue} />
                <SummaryRow
                  label="Stop on reply"
                  value={c.stop_on_reply ? "Yes" : "No"}
                />
                <SummaryRow label="Sending" value={sendingLabel(c)} />

                <div className="flex flex-wrap gap-2 pt-1">
                  {totalEnrolled === 0 ? (
                    <span className="text-sm text-muted-foreground">
                      No one enrolled yet.
                    </span>
                  ) : (
                    statusEntries.map((s) => {
                      const n = enrollByStatus.get(s) ?? 0;
                      if (n === 0) return null;
                      return (
                        <Badge key={s} variant="secondary">
                          {n} {s}
                        </Badge>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Sequence · {stepList.length} email
                  {stepList.length === 1 ? "" : "s"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CampaignSequence steps={sequenceSteps} />
              </CardContent>
            </Card>
          </>
        }
        performance={
          <CampaignPerformance funnel={funnel} enrolled={totalEnrolled} />
        }
      />
    </div>
  );
}
