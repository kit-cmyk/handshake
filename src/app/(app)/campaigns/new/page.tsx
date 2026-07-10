import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const { supabase, org, userEmail } = await requireContext();
  const { template: templateId } = await searchParams;

  const [{ data: segments }, { data: mailboxes }, { data: members }, contacts] =
    await Promise.all([
      supabase
        .from("segments")
        .select("id, name, type")
        .eq("org_id", org.id)
        .order("name"),
      supabase
        .from("mailboxes")
        .select("id, email, display_name")
        .eq("org_id", org.id)
        .eq("status", "active"),
      supabase.from("segment_members").select("segment_id").eq("org_id", org.id),
      loadCampaignContacts(supabase, org.id),
    ]);

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
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to campaigns
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New campaign</h1>
        <p className="text-sm text-muted-foreground">
          Five quick steps: details, audience, sequence, review, and schedule.
        </p>
      </div>
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
