import { PageHeader } from "@/components/page-header";
import { requireContext } from "@/lib/context";
import { NewCampaign } from "./new-campaign";
import { loadCampaignContacts } from "../contact-options";
import {
  findTemplate,
  loadEmailSnippets,
  loadTemplatesByKind,
} from "@/lib/templates/queries";
import { isCampaignTemplate, type CampaignTemplate } from "@/lib/templates/types";
import type { Mailbox } from "@/lib/types";
import type { Segment } from "@/lib/segments";
import { fetchAllRows } from "@/lib/supabase/paginate";

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const { supabase, org, userEmail } = await requireContext();
  const { template: templateId } = await searchParams;

  const [{ data: segments }, { data: mailboxes }, members, contacts] =
    await Promise.all([
      supabase
        .from("segments")
        .select("id, name, type")
        .eq("org_id", org.id)
        // A campaign's own auto-managed audience list isn't a pickable segment.
        .eq("managed", false)
        .order("name"),
      supabase
        .from("mailboxes")
        .select("id, email, display_name")
        .eq("org_id", org.id)
        .eq("status", "active"),
      // Paged: these counts describe the whole org, and total membership
      // crosses the 1000-row cap long before any single segment does.
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
  const mailboxOptions = ((mailboxes ?? []) as Mailbox[]).map((m) => ({
    id: m.id,
    name: m.display_name ? `${m.display_name} · ${m.email}` : m.email,
  }));

  // Campaign templates (curated + org-saved) for the picker gallery, plus an
  // optional deep-linked selection from the template library.
  const campaignTemplates = (
    await loadTemplatesByKind(supabase, org.id, "campaign")
  ).filter(isCampaignTemplate);

  let initialTemplate: CampaignTemplate | null = null;
  if (templateId) {
    const found = await findTemplate(supabase, org.id, templateId, "campaign");
    if (found && isCampaignTemplate(found)) initialTemplate = found;
  }

  const emailTemplates = await loadEmailSnippets(supabase, org.id);

  return (
    <div className="space-y-6">
      <PageHeader
        back="campaigns"
        title="New campaign"
        description="Five quick steps: details, audience, sequence, review, and schedule."
      />
      <NewCampaign
        templates={campaignTemplates}
        initialTemplate={initialTemplate}
        segments={segmentOptions}
        mailboxes={mailboxOptions}
        contacts={contacts}
        defaultTestEmail={userEmail}
        emailTemplates={emailTemplates}
      />
    </div>
  );
}
