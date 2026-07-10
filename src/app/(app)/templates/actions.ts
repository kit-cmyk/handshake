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
