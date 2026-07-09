import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/lib/context";
import { WorkflowBuilder } from "../../workflow-builder";
import { parseGraph, parseExitConfig, type Workflow } from "@/lib/workflows";
import type { Mailbox } from "@/lib/types";
import type { Segment } from "@/lib/segments";

export default async function EditWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, org } = await requireContext();

  const { data: workflow } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!workflow) notFound();

  const w = {
    ...workflow,
    graph: parseGraph(workflow.graph),
    exit_config: parseExitConfig(workflow.exit_config),
  } as Workflow;

  const [
    { data: segments },
    { data: campaigns },
    { data: otherWorkflows },
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
      .neq("id", id)
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
  const workflowOptions = (
    (otherWorkflows ?? []) as { id: string; name: string }[]
  ).map((wf) => ({ id: wf.id, name: wf.name }));
  const mailboxOptions = ((mailboxes ?? []) as Mailbox[]).map((m) => ({
    id: m.id,
    name: m.display_name ? `${m.display_name} · ${m.email}` : m.email,
    email: m.email,
    displayName: m.display_name,
  }));

  return (
    <div className="space-y-6">
      <Link
        href={`/workflows/${w.id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to workflow
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit workflow</h1>
        <p className="text-sm text-muted-foreground">{w.name}</p>
      </div>
      <WorkflowBuilder
        workflow={w}
        segments={segmentOptions}
        campaigns={campaignOptions}
        workflows={workflowOptions}
        mailboxes={mailboxOptions}
      />
    </div>
  );
}
