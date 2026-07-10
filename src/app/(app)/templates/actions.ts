"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";
import type {
  CampaignTemplateContent,
  EmailTemplateContent,
  TemplateContent,
  TemplateKind,
  WorkflowTemplateContent,
} from "@/lib/templates/types";

export type TemplateState = { ok?: boolean; error?: string; id?: string };

const KINDS: TemplateKind[] = ["email", "campaign", "workflow"];

/**
 * Persist a user-authored template. `content` shape must match `kind`; we do a
 * light structural check so bad payloads don't reach the sequence/builder later.
 */
export async function saveTemplate(input: {
  kind: TemplateKind;
  name: string;
  description?: string;
  content: TemplateContent;
}): Promise<TemplateState> {
  const { supabase, org, userId } = await requireContext();

  const name = input.name?.trim();
  if (!name) return { error: "Give the template a name." };
  if (!KINDS.includes(input.kind)) return { error: "Unknown template kind." };
  if (!validateContent(input.kind, input.content)) {
    return { error: "Template content is incomplete." };
  }

  const { data, error } = await supabase
    .from("templates")
    .insert({
      org_id: org.id,
      kind: input.kind,
      name,
      description: input.description?.trim() || null,
      content: input.content,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/templates");
  return { ok: true, id: data.id as string };
}

/** Delete an org-owned template. Curated templates (string ids) never match. */
export async function deleteTemplate(id: string): Promise<TemplateState> {
  const { supabase, org } = await requireContext();
  const { error } = await supabase
    .from("templates")
    .delete()
    .eq("id", id)
    .eq("org_id", org.id);
  if (error) return { error: error.message };
  revalidatePath("/templates");
  return { ok: true };
}

/** Snapshot an existing campaign (+ its steps) into a reusable template. */
export async function saveCampaignAsTemplate(input: {
  campaignId: string;
  name: string;
  description?: string;
}): Promise<TemplateState> {
  const { supabase, org, userId } = await requireContext();
  const name = input.name?.trim();
  if (!name) return { error: "Give the template a name." };

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, stop_on_reply")
    .eq("id", input.campaignId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!campaign) return { error: "Campaign not found." };

  const { data: steps } = await supabase
    .from("campaign_steps")
    .select("subject, body, wait_minutes, stop_on_reply, position")
    .eq("campaign_id", input.campaignId)
    .order("position", { ascending: true });

  if (!steps?.length) return { error: "This campaign has no steps to save." };

  const content: CampaignTemplateContent = {
    stop_on_reply: !!(campaign as { stop_on_reply: boolean }).stop_on_reply,
    steps: steps.map((s) => {
      const step = s as {
        subject: string | null;
        body: string | null;
        wait_minutes: number | null;
        stop_on_reply: boolean | null;
      };
      return {
        subject: step.subject ?? "",
        body: step.body ?? "",
        wait_minutes: step.wait_minutes ?? 0,
        stop_on_reply: step.stop_on_reply ?? null,
      };
    }),
  };

  const { data, error } = await supabase
    .from("templates")
    .insert({
      org_id: org.id,
      kind: "campaign",
      name,
      description: input.description?.trim() || null,
      content,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/templates");
  return { ok: true, id: data.id as string };
}

/** Snapshot an existing workflow (trigger + graph) into a reusable template. */
export async function saveWorkflowAsTemplate(input: {
  workflowId: string;
  name: string;
  description?: string;
}): Promise<TemplateState> {
  const { supabase, org, userId } = await requireContext();
  const name = input.name?.trim();
  if (!name) return { error: "Give the template a name." };

  const { data: workflow } = await supabase
    .from("workflows")
    .select("trigger_type, graph")
    .eq("id", input.workflowId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!workflow) return { error: "Workflow not found." };

  const wf = workflow as {
    trigger_type: WorkflowTemplateContent["trigger_type"];
    graph: WorkflowTemplateContent["graph"];
  };
  const content: WorkflowTemplateContent = {
    trigger_type: wf.trigger_type,
    graph: wf.graph ?? { nodes: [], edges: [] },
  };

  const { data, error } = await supabase
    .from("templates")
    .insert({
      org_id: org.id,
      kind: "workflow",
      name,
      description: input.description?.trim() || null,
      content,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/templates");
  return { ok: true, id: data.id as string };
}

function validateContent(kind: TemplateKind, content: TemplateContent): boolean {
  if (!content || typeof content !== "object") return false;
  if (kind === "email") {
    const c = content as EmailTemplateContent;
    return typeof c.subject === "string" && typeof c.body === "string";
  }
  if (kind === "campaign") {
    const c = content as CampaignTemplateContent;
    return Array.isArray(c.steps) && c.steps.length > 0;
  }
  const c = content as WorkflowTemplateContent;
  return (
    typeof c.trigger_type === "string" &&
    !!c.graph &&
    Array.isArray(c.graph.nodes)
  );
}
