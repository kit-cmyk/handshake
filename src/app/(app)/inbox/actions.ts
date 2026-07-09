"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";
import { inngest } from "@/lib/inngest/client";
import { getEmailProvider, defaultFrom } from "@/lib/email/provider";
import { renderTemplate, type MergeContact } from "@/lib/email/template";
import { wrapEmail } from "@/lib/email/layout";
import { makeSnippet } from "@/lib/inbox/inbound";
import {
  ACTIVITY_TYPES,
  type ActivityType,
  type ConversationStatus,
} from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SendState = { ok?: boolean; error?: string };
export type ActivityState = { ok?: boolean; error?: string };
export type ComposeState = { ok?: boolean; error?: string; conversationId?: string };

const FALLBACK_FROM = defaultFrom();

/** Resolve a "Name <email>" from line from the org's active mailbox. */
async function resolveFrom(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ from: string; replyTo?: string }> {
  const { data: mailbox } = await supabase
    .from("mailboxes")
    .select("email, display_name")
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!mailbox?.email) return { from: FALLBACK_FROM };
  const m = mailbox as { email: string; display_name: string | null };
  return {
    from: `${m.display_name ?? ""} <${m.email}>`.trim(),
    replyTo: m.email,
  };
}

type ContactRow = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  lifecycle_stage: string | null;
  companies: { name: string | null } | null;
};

function mergeFrom(contact: ContactRow | null): MergeContact {
  return {
    first_name: contact?.first_name,
    last_name: contact?.last_name,
    email: contact?.email,
    phone: contact?.phone,
    title: contact?.title,
    lifecycle_stage: contact?.lifecycle_stage,
    company: contact?.companies?.name ?? null,
  };
}

/**
 * Render, send, and record an outbound email against a conversation. Returns an
 * error message, or null on success. Shared by reply + compose.
 */
async function deliverEmail(params: {
  supabase: SupabaseClient;
  orgId: string;
  userId: string;
  conversationId: string;
  contactId: string;
  to: string;
  merge: MergeContact;
  subject: string;
  bodyHtml: string;
}): Promise<string | null> {
  const renderedSubject = renderTemplate(params.subject, params.merge);
  const renderedHtml = renderTemplate(params.bodyHtml, params.merge);

  const { from, replyTo } = await resolveFrom(params.supabase, params.orgId);

  const res = await getEmailProvider().send({
    from,
    to: params.to,
    subject: renderedSubject,
    html: wrapEmail(renderedHtml, { preheader: makeSnippet({ html: renderedHtml }) }),
    replyTo,
  });
  if (res.status === "failed") return res.error || "Failed to send email.";

  // One-off sends are messages, not `sent` events, so they never double up with
  // the campaign funnel timeline lines. The conversation trigger bumps last_*.
  const { error } = await params.supabase.from("messages").insert({
    org_id: params.orgId,
    conversation_id: params.conversationId,
    contact_id: params.contactId,
    direction: "outbound",
    channel: "email",
    from_address: from,
    to_address: params.to,
    subject: renderedSubject,
    body_html: renderedHtml,
    snippet: makeSnippet({ html: renderedHtml }),
    user_id: params.userId,
    provider_message_id: res.id || null,
  });
  return error ? error.message : null;
}

/** Send a reply within an existing conversation. */
export async function sendEmail(
  conversationId: string,
  _prev: SendState,
  fd: FormData
): Promise<SendState> {
  const { supabase, org, userId } = await requireContext();

  const { data: conv } = await supabase
    .from("conversations")
    .select(
      "id, contact_id, contacts(first_name, last_name, email, phone, title, lifecycle_stage, companies(name))"
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return { error: "Conversation not found." };

  const contact = (conv as unknown as { contacts: ContactRow | null }).contacts;
  const to = contact?.email?.trim();
  if (!to) return { error: "This contact has no email address." };

  const subject = String(fd.get("subject") ?? "").trim();
  const bodyHtml = String(fd.get("body") ?? "").trim();
  if (!subject) return { error: "Add a subject." };
  if (!bodyHtml || bodyHtml === "<p></p>") return { error: "Write a message first." };

  const error = await deliverEmail({
    supabase,
    orgId: org.id,
    userId,
    conversationId,
    contactId: (conv as { contact_id: string }).contact_id,
    to,
    merge: mergeFrom(contact),
    subject,
    bodyHtml,
  });
  if (error) return { error };

  revalidatePath("/inbox");
  return { ok: true };
}

/** Start (or reuse) a conversation with a contact and send the first email. */
export async function composeEmail(
  _prev: ComposeState,
  fd: FormData
): Promise<ComposeState> {
  const { supabase, org, userId } = await requireContext();

  const contactId = String(fd.get("contact_id") ?? "").trim();
  if (!contactId) return { error: "Pick a contact to email." };

  const subject = String(fd.get("subject") ?? "").trim();
  const bodyHtml = String(fd.get("body") ?? "").trim();
  if (!subject) return { error: "Add a subject." };
  if (!bodyHtml || bodyHtml === "<p></p>") return { error: "Write a message first." };

  const { data: contact } = await supabase
    .from("contacts")
    .select(
      "id, company_id, first_name, last_name, email, phone, title, lifecycle_stage, companies(name)"
    )
    .eq("id", contactId)
    .maybeSingle();
  if (!contact) return { error: "Contact not found." };
  const c = contact as unknown as ContactRow & {
    id: string;
    company_id: string | null;
  };
  const to = c.email?.trim();
  if (!to) return { error: "This contact has no email address." };

  // Upsert the contact's email conversation (unique per org+contact+channel).
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .upsert(
      {
        org_id: org.id,
        contact_id: contactId,
        company_id: c.company_id ?? null,
        channel: "email",
        subject,
      },
      { onConflict: "org_id,contact_id,channel" }
    )
    .select("id")
    .maybeSingle();
  if (convErr || !conv) {
    return { error: convErr?.message || "Could not open a conversation." };
  }

  const conversationId = (conv as { id: string }).id;
  const error = await deliverEmail({
    supabase,
    orgId: org.id,
    userId,
    conversationId,
    contactId,
    to,
    merge: mergeFrom(c),
    subject,
    bodyHtml,
  });
  if (error) return { error };

  revalidatePath("/inbox");
  return { ok: true, conversationId };
}

/** Log a note/call/task/appointment against the conversation's contact. */
export async function logActivity(
  conversationId: string,
  contactId: string,
  _prev: ActivityState,
  fd: FormData
): Promise<ActivityState> {
  const { supabase, org, userId } = await requireContext();

  const typeRaw = String(fd.get("type") ?? "note");
  const type = (
    ACTIVITY_TYPES.includes(typeRaw as ActivityType) ? typeRaw : "note"
  ) as ActivityType;
  const body = String(fd.get("body") ?? "").trim();
  const dueRaw = String(fd.get("due_at") ?? "").trim();
  if (!body) return { error: "Write something first." };

  const { error } = await supabase.from("activities").insert({
    org_id: org.id,
    contact_id: contactId,
    user_id: userId,
    type,
    body,
    due_at:
      (type === "task" || type === "appointment") && dueRaw
        ? new Date(dueRaw).toISOString()
        : null,
  });
  if (error) return { error: error.message };

  // Drives activity_logged campaign triggers, same as the contact detail page.
  await inngest.send({
    name: "contact/activity.logged",
    data: { orgId: org.id, contactId, activityType: type },
  });

  revalidatePath("/inbox");
  return { ok: true };
}

/** Mark a conversation read for the current user (clears its unread badge). */
export async function markConversationRead(conversationId: string): Promise<void> {
  const { supabase, org, userId } = await requireContext();
  await supabase.from("conversation_reads").upsert(
    {
      org_id: org.id,
      conversation_id: conversationId,
      user_id: userId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id,user_id" }
  );
  revalidatePath("/inbox");
}

/** Open or close a conversation. */
export async function setConversationStatus(
  conversationId: string,
  status: ConversationStatus
): Promise<void> {
  const { supabase } = await requireContext();
  await supabase
    .from("conversations")
    .update({ status })
    .eq("id", conversationId);
  revalidatePath("/inbox");
}

/** Assign the conversation to the current user, or clear the assignee. */
export async function assignConversation(
  conversationId: string,
  toMe: boolean
): Promise<void> {
  const { supabase, userId } = await requireContext();
  await supabase
    .from("conversations")
    .update({ assignee_id: toMe ? userId : null })
    .eq("id", conversationId);
  revalidatePath("/inbox");
}
