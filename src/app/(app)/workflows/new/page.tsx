import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/lib/context";
import { NewWorkflow } from "./new-workflow";
import type { WorkflowTemplate } from "../templates";
import {
  findTemplate,
  loadEmailSnippets,
  loadTemplatesByKind,
} from "@/lib/templates/queries";
import { isWorkflowTemplate, type Template } from "@/lib/templates/types";
import type { Mailbox } from "@/lib/types";
import type { Segment } from "@/lib/segments";

/** Adapt a library workflow template into the builder's WorkflowTemplate shape. */
function toBuilderTemplate(t: Template): WorkflowTemplate | null {
  if (!isWorkflowTemplate(t)) return null;
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    trigger_type: t.content.trigger_type,
    graph: t.content.graph,
  };
}

export default async function NewWorkflowPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const { supabase, org } = await requireContext();
  const { template: templateId } = await searchParams;

  const [
    { data: segments },
    { data: campaigns },
    { data: workflows },
    { data: mailboxes },
  ] = await Promise.all([
    supabase.from("segments").select("id, name").eq("org_id", org.id).order("name"),
    supabase
      .from("campaigns")
      .select("id, name")
      .eq("org_id", org.id)
      .neq("status", "archived")
      .order("name"),
    supabase
      .from("workflows")
      .select("id, name")
      .eq("org_id", org.id)
      .neq("status", "ended")
      .order("name"),
    supabase
      .from("mailboxes")
      .select("id, email, display_name")
      .eq("org_id", org.id)
      .eq("status", "active"),
  ]);

  const segmentOptions = ((segments ?? []) as Pick<Segment, "id" | "name">[]).map(
    (s) => ({ id: s.id, name: s.name })
  );
  const campaignOptions = ((campaigns ?? []) as { id: string; name: string }[]).map(
    (c) => ({ id: c.id, name: c.name })
  );
  const workflowOptions = ((workflows ?? []) as { id: string; name: string }[]).map(
    (w) => ({ id: w.id, name: w.name })
  );
  const mailboxOptions = ((mailboxes ?? []) as Mailbox[]).map((m) => ({
    id: m.id,
    name: m.display_name ? `${m.display_name} · ${m.email}` : m.email,
    email: m.email,
    displayName: m.display_name,
  }));

  // Org-saved workflow templates for the picker, plus a deep-linked selection.
  const libraryTemplates = await loadTemplatesByKind(supabase, org.id, "workflow");
  const userTemplates = libraryTemplates
    .filter((t) => t.source === "org")
    .map(toBuilderTemplate)
    .filter((t): t is WorkflowTemplate => t !== null);

  const initialTemplate = templateId
    ? toBuilderTemplate(
        (await findTemplate(supabase, org.id, templateId, "workflow")) ??
          ({} as Template)
      )
    : null;

  const emailTemplates = await loadEmailSnippets(supabase, org.id);

  return (
    <div className="space-y-6">
      <Link
        href="/workflows"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to workflows
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New workflow</h1>
        <p className="text-sm text-muted-foreground">
          Pick a trigger, then build the automation.
        </p>
      </div>
      <NewWorkflow
        segments={segmentOptions}
        campaigns={campaignOptions}
        workflows={workflowOptions}
        mailboxes={mailboxOptions}
        userTemplates={userTemplates}
        initialTemplate={initialTemplate}
        emailTemplates={emailTemplates}
      />
    </div>
  );
}
