import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireContext } from "@/lib/context";
import { CampaignWizard } from "../../campaign-wizard";
import { loadCampaignContacts } from "../../contact-options";
import { loadEmailSnippets } from "@/lib/templates/queries";
import type { Campaign, CampaignStep, Mailbox } from "@/lib/types";
import type { Segment } from "@/lib/segments";
import { fetchAllRows } from "@/lib/supabase/paginate";

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
    members,
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
      // A campaign's own auto-managed audience list isn't a segment the user
      // picks — it's the result of picking "contacts" or "import".
      .eq("managed", false)
      .order("name"),
    supabase
      .from("mailboxes")
      .select("id, email, display_name, status")
      .eq("org_id", org.id),
    // Paged: the counts beside each segment describe the whole org, and this
    // crosses the 1000-row cap on total membership, not per segment.
    fetchAllRows<{ segment_id: string }>((from, to) =>
      supabase
        .from("segment_members")
        .select("segment_id, id")
        .eq("org_id", org.id)
        .order("id")
        .range(from, to)
    ),
    loadCampaignContacts(supabase, org.id),
  ]);

  if (!campaign) notFound();
  const c = campaign as Campaign;

  const emailTemplates = await loadEmailSnippets(supabase, org.id);

  // For a list audience, the attached segment is auto-managed; its members are
  // the currently-selected contacts, so the wizard can re-check them.
  let initialContactIds: string[] = [];
  if (c.audience_mode !== "segment" && c.segment_id) {
    const audienceMembers = await fetchAllRows<{ contact_id: string }>(
      (from, to) =>
        supabase
          .from("segment_members")
          .select("contact_id")
          .eq("segment_id", c.segment_id as string)
          .order("contact_id")
          .range(from, to)
    );
    initialContactIds = audienceMembers.map((m) => m.contact_id);
  }

  const countBySegment = new Map<string, number>();
  for (const m of members) {
    countBySegment.set(m.segment_id, (countBySegment.get(m.segment_id) ?? 0) + 1);
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
      <PageHeader
        back={{ href: `/campaigns/${c.id}`, label: "Back to campaign" }}
        title="Edit campaign"
        description={c.name}
      />
      <CampaignWizard
        campaign={c}
        steps={(steps ?? []) as CampaignStep[]}
        segments={segmentOptions}
        mailboxes={mailboxOptions}
        contacts={contacts}
        initialContactIds={initialContactIds}
        defaultTestEmail={userEmail}
        emailTemplates={emailTemplates}
      />
    </div>
  );
}
