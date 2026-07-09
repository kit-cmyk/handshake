import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/lib/context";
import { CampaignWizard } from "../../campaign-wizard";
import { loadCampaignContacts } from "../../contact-options";
import type { Campaign, CampaignStep, Mailbox } from "@/lib/types";
import type { Segment } from "@/lib/segments";

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, org, userEmail } = await requireContext();

  const [
    { data: campaign },
    { data: steps },
    { data: segments },
    { data: mailboxes },
    { data: members },
    contacts,
  ] = await Promise.all([
    supabase.from("campaigns").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("campaign_steps")
      .select("*")
      .eq("campaign_id", id)
      .order("position", { ascending: true }),
    supabase
      .from("segments")
      .select("id, name, type")
      .eq("org_id", org.id)
      .order("name"),
    supabase
      .from("mailboxes")
      .select("id, email, display_name, status")
      .eq("org_id", org.id),
    supabase.from("segment_members").select("segment_id").eq("org_id", org.id),
    loadCampaignContacts(supabase, org.id),
  ]);

  if (!campaign) notFound();
  const c = campaign as Campaign;

  // For a list audience, the attached segment is auto-managed; its members are
  // the currently-selected contacts, so the wizard can re-check them.
  let initialContactIds: string[] = [];
  if (c.audience_mode !== "segment" && c.segment_id) {
    const { data: audienceMembers } = await supabase
      .from("segment_members")
      .select("contact_id")
      .eq("segment_id", c.segment_id);
    initialContactIds = (audienceMembers ?? []).map(
      (m) => (m as { contact_id: string }).contact_id
    );
  }

  const countBySegment = new Map<string, number>();
  for (const m of members ?? []) {
    const sid = (m as { segment_id: string }).segment_id;
    countBySegment.set(sid, (countBySegment.get(sid) ?? 0) + 1);
  }

  const segmentOptions = (
    (segments ?? []) as Pick<Segment, "id" | "name" | "type">[]
  ).map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    count: countBySegment.get(s.id) ?? 0,
  }));

  // Keep active mailboxes, plus the campaign's currently-selected mailbox even
  // if it has since been disabled — otherwise it would silently vanish from the
  // dropdown while still being used to send.
  const mailboxRows = ((mailboxes ?? []) as (Mailbox & { status: string })[]).filter(
    (m) => m.status === "active" || m.id === c.mailbox_id
  );
  const mailboxOptions = mailboxRows.map((m) => {
    const base = m.display_name ? `${m.display_name} · ${m.email}` : m.email;
    return {
      id: m.id,
      name: m.status === "active" ? base : `${base} (disabled)`,
    };
  });

  return (
    <div className="space-y-6">
      <Link
        href={`/campaigns/${c.id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to campaign
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit campaign</h1>
        <p className="text-sm text-muted-foreground">{c.name}</p>
      </div>
      <CampaignWizard
        campaign={c}
        steps={(steps ?? []) as CampaignStep[]}
        segments={segmentOptions}
        mailboxes={mailboxOptions}
        contacts={contacts}
        initialContactIds={initialContactIds}
        defaultTestEmail={userEmail}
      />
    </div>
  );
}
