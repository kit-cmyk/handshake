"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireContext } from "@/lib/context";
import { inngest } from "@/lib/inngest/client";
import { getEmailProvider, defaultFrom } from "@/lib/email/provider";
import { renderTemplate, withUnsubscribe } from "@/lib/email/template";
import { wrapEmail } from "@/lib/email/layout";
import {
  evaluateFilter,
  parseDefinition,
  EVALUABLE_SELECT,
  type EvaluableContact,
} from "@/lib/segments";
import {
  parseGraph,
  validateGraph,
  parseExitConfig,
  actionConfigErrors,
  triggerConfigErrors,
  type TriggerType,
  type WorkflowStatus,
} from "@/lib/workflows";

export type WorkflowState = { ok?: boolean; error?: string };

const TRIGGERS: TriggerType[] = [
  "manual",
  "segment_entry",
  "reply",
  "stage_change",
];

async function resolveSegmentContactIds(
  supabase: SupabaseClient,
  orgId: string,
  segmentId: string
): Promise<string[]> {
  const { data: segment } = await supabase
    .from("segments")
    .select("type, definition")
    .eq("id", segmentId)
    .single();
  if (!segment) return [];
  if (segment.type === "dynamic") {
    const { data: contacts } = await supabase
      .from("contacts")
      .select(EVALUABLE_SELECT)
      .eq("org_id", orgId);
    return evaluateFilter(
      (contacts ?? []) as unknown as EvaluableContact[],
      parseDefinition(segment.definition)
    ).map((c) => c.id);
  }
  const { data: members } = await supabase
    .from("segment_members")
    .select("contact_id")
    .eq("segment_id", segmentId);
  return (members ?? []).map((m) => (m as { contact_id: string }).contact_id);
}

export async function saveWorkflow(
  _prev: WorkflowState,
  fd: FormData
): Promise<WorkflowState> {
  const { supabase, org } = await requireContext();

  const id = (fd.get("id") as string) || null;
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { error: "Workflow name is required." };

  const triggerRaw = String(fd.get("trigger_type") ?? "manual");
  const trigger_type = (
    TRIGGERS.includes(triggerRaw as TriggerType) ? triggerRaw : "manual"
  ) as TriggerType;

  const mailbox_id = (fd.get("mailbox_id") as string) || null;

  let trigger_config: Record<string, unknown> = {};
  let exit_config;
  let graph;
  try {
    trigger_config = JSON.parse(String(fd.get("trigger_config") ?? "{}"));
    exit_config = parseExitConfig(JSON.parse(String(fd.get("exit_config") ?? "{}")));
    graph = parseGraph(JSON.parse(String(fd.get("graph") ?? "{}")));
  } catch {
    return { error: "Invalid workflow data." };
  }

  // Reject partially-configured steps (mirrors the builder's client-side gate).
  if (
    triggerConfigErrors(trigger_type, {
      segmentId: (trigger_config as { segmentId?: string }).segmentId,
    }).length > 0 ||
    graph.nodes.some(
      (n) =>
        n.data?.kind === "action" &&
        n.data.action &&
        actionConfigErrors(n.data.action, n.data.config ?? {}).length > 0
    )
  ) {
    return { error: "Finish configuring all steps before saving." };
  }

  // Reject structurally-broken graphs (unreachable steps, cycles).
  if (validateGraph(graph).some((i) => i.severity === "error")) {
    return { error: "Fix the workflow structure before saving." };
  }

  // The review step's "Set live" submits go_live=1: save and start running so
  // triggers fire immediately. Otherwise a new workflow saves as a draft and an
  // existing one keeps its current status.
  const goLive = fd.get("go_live") === "1";
  const fields: Record<string, unknown> = {
    name,
    trigger_type,
    trigger_config,
    exit_config,
    mailbox_id,
    graph,
    ...(goLive ? { status: "running" } : {}),
  };
  let workflowId = id;

  if (id) {
    const { error } = await supabase
      .from("workflows")
      .update(fields)
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from("workflows")
      .insert({ ...fields, org_id: org.id, status: goLive ? "running" : "draft" })
      .select("id")
      .single();
    if (error) return { error: error.message };
    workflowId = data.id as string;
  }

  revalidatePath("/workflows");
  redirect(`/workflows/${workflowId}`);
}

export async function enrollWorkflow(
  workflowId: string
): Promise<WorkflowState & { enrolled?: number; skipped?: number }> {
  const { supabase, org } = await requireContext();

  const { data: wf } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .single();
  if (!wf) return { error: "Workflow not found." };

  const segmentId = (wf.trigger_config as { segmentId?: string })?.segmentId;
  if (!segmentId) return { error: "Set a target segment on the trigger first." };

  const graph = parseGraph(wf.graph);
  if (!graph.nodes.some((n) => n.data?.kind === "action"))
    return { error: "Add at least one action before enrolling." };

  const memberIds = await resolveSegmentContactIds(supabase, org.id, segmentId);
  if (!memberIds.length) return { error: "Segment has no members." };

  const { data: activeRuns } = await supabase
    .from("workflow_runs")
    .select("contact_id")
    .eq("workflow_id", workflowId)
    .eq("status", "active");
  const alreadyActive = new Set(
    (activeRuns ?? []).map((r) => (r as { contact_id: string }).contact_id)
  );

  const eligible = memberIds.filter((cid) => !alreadyActive.has(cid));
  if (!eligible.length) return { ok: true, enrolled: 0, skipped: memberIds.length };

  const { data: runs, error } = await supabase
    .from("workflow_runs")
    .insert(
      eligible.map((cid) => ({
        org_id: org.id,
        workflow_id: workflowId,
        contact_id: cid,
        status: "active",
      }))
    )
    .select("id");
  if (error) return { error: error.message };

  await supabase.from("workflows").update({ status: "running" }).eq("id", workflowId);

  await inngest.send(
    (runs ?? []).map((r) => ({
      name: "workflow/run.started",
      data: { runId: (r as { id: string }).id },
    }))
  );

  revalidatePath(`/workflows/${workflowId}`);
  return {
    ok: true,
    enrolled: runs?.length ?? 0,
    skipped: memberIds.length - (runs?.length ?? 0),
  };
}

export async function setWorkflowStatus(
  workflowId: string,
  status: WorkflowStatus
): Promise<WorkflowState> {
  const { supabase } = await requireContext();
  const { error } = await supabase
    .from("workflows")
    .update({ status })
    .eq("id", workflowId);
  if (error) return { error: error.message };
  revalidatePath(`/workflows/${workflowId}`);
  revalidatePath("/workflows");
  return { ok: true };
}

/** Count contacts a segment currently resolves to — for the dry-run preview. */
export async function countSegmentContacts(
  segmentId: string
): Promise<{ count: number }> {
  const { supabase, org } = await requireContext();
  const ids = await resolveSegmentContactIds(supabase, org.id, segmentId);
  return { count: ids.length };
}

/**
 * Send a one-off test of an email step to a chosen address, rendered with
 * sample merge data so the sender can preview subject + body before shipping.
 */
export async function sendTestWorkflowEmail(input: {
  subject: string;
  body: string;
  to: string;
  mailboxId?: string | null;
}): Promise<WorkflowState> {
  const { supabase, org, userEmail } = await requireContext();
  const to = input.to?.trim() || userEmail || "";
  if (!to) return { error: "Enter an email address to send the test to." };
  if (!input.subject.trim() && !input.body.trim())
    return { error: "Add a subject or body first." };

  let from = defaultFrom();
  if (input.mailboxId) {
    const { data: m } = await supabase
      .from("mailboxes")
      .select("email, display_name")
      .eq("id", input.mailboxId)
      .eq("org_id", org.id)
      .maybeSingle();
    if (m) from = `${m.display_name ?? ""} <${m.email}>`.trim();
  }

  const sample = {
    first_name: "there",
    last_name: "",
    email: to,
    company: org.name ?? "your company",
  };
  const subject = `[Test] ${renderTemplate(input.subject, sample)}`;
  const html = wrapEmail(withUnsubscribe(renderTemplate(input.body, sample), "#"));

  const res = await getEmailProvider().send({ from, to, subject, html });
  if (res.status !== "sent")
    return { error: res.error ?? "The email provider rejected the test." };
  return { ok: true };
}

export async function deleteWorkflow(id: string): Promise<WorkflowState> {
  const { supabase } = await requireContext();
  const { error } = await supabase.from("workflows").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/workflows");
  return { ok: true };
}

/**
 * Clone a workflow into a fresh draft: copies the trigger, exit criteria,
 * mailbox, and graph, but starts with no runs and a "(copy)" name so it can be
 * edited and set live independently.
 */
export async function duplicateWorkflow(
  id: string
): Promise<WorkflowState & { id?: string }> {
  const { supabase, org } = await requireContext();

  const { data: source } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", id)
    .single();
  if (!source) return { error: "Workflow not found." };

  const { data: created, error } = await supabase
    .from("workflows")
    .insert({
      org_id: org.id,
      name: `${source.name} (copy)`,
      status: "draft",
      trigger_type: source.trigger_type,
      trigger_config: source.trigger_config,
      exit_config: source.exit_config,
      mailbox_id: source.mailbox_id,
      graph: source.graph,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/workflows");
  return { ok: true, id: created.id as string };
}
