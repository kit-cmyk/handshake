"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";
import { inngest } from "@/lib/inngest/client";
import { defaultFrom } from "@/lib/email/provider";
import {
  sendViaMailbox,
  MAILBOX_SENDER_COLUMNS,
  type MailboxSender,
} from "@/lib/email/send";
import { renderTemplate, type MergeContact } from "@/lib/email/template";
import { wrapEmail } from "@/lib/email/layout";
import { makeSnippet } from "@/lib/inbox/inbound";
import { resolveCopyList } from "@/lib/email/recipients";
import { EMAIL_RE } from "@/lib/data-quality";
import {
  buildThreadHeaders,
  newMessageId,
  replySubject,
  threadHeaderFields,
} from "@/lib/inbox/threading";
import {
  ACTIVITY_TYPES,
  CONVERSATION_STATUSES,
  type ActivityType,
  type ConversationStatus,
} from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SendState = { ok?: boolean; error?: string };
export type ActivityState = { ok?: boolean; error?: string };
export type ComposeState = { ok?: boolean; error?: string; conversationId?: string };

const FALLBACK_FROM = defaultFrom();

/**
 * Resolve the org's active mailbox plus a "Name <email>" from line. Returns the
 * full sender row so deliverEmail can route through a connected Gmail/Outlook
 * account; falls back to the global provider's default from when there is none.
 */
async function resolveFrom(
  supabase: SupabaseClient,
  orgId: string
): Promise<{
  from: string;
  replyTo?: string;
  mailbox: MailboxSender | null;
  senderName: string;
  senderEmail: string;
}> {
  const { data: mailbox } = await supabase
    .from("mailboxes")
    .select(`email, display_name, ${MAILBOX_SENDER_COLUMNS}`)
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!mailbox) {
    // No mailbox: fall back to the global default identity for the {{sender_*}}
    // tokens, parsed from EMAIL_FROM's "Name <email>" form.
    return {
      from: FALLBACK_FROM,
      mailbox: null,
      senderName: parseFromName(FALLBACK_FROM),
      senderEmail: parseFromEmail(FALLBACK_FROM),
    };
  }
  const m = mailbox as MailboxSender & { email: string; display_name: string | null };
  const address = m.oauth_email ?? m.email;
  return {
    from: `${m.display_name ?? ""} <${address}>`.trim(),
    replyTo: address,
    mailbox: m,
    senderName: m.display_name ?? "",
    senderEmail: address,
  };
}

/** Extract the display name from a "Name <email>" from-line. */
function parseFromName(from: string): string {
  const i = from.indexOf("<");
  return i > 0 ? from.slice(0, i).trim() : "";
}

/** Extract the address from a "Name <email>" from-line (or the whole string). */
function parseFromEmail(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim();
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
 *
 * The send always joins the conversation's thread: it carries a Message-ID we
 * mint plus In-Reply-To / References built from the thread's earlier ids, so the
 * recipient's mail client files it under the same conversation instead of
 * opening a new one — and so an inbound reply resolves back to this thread.
 */
async function deliverEmail(params: {
  supabase: SupabaseClient;
  orgId: string;
  userId: string;
  conversationId: string;
  contactId: string;
  to: string;
  cc?: string[];
  bcc?: string[];
  merge: MergeContact;
  subject: string;
  bodyHtml: string;
}): Promise<string | null> {
  const { from, replyTo, mailbox, senderName, senderEmail } = await resolveFrom(
    params.supabase,
    params.orgId
  );
  const { data: orgRow } = await params.supabase
    .from("organizations")
    .select("booking_url")
    .eq("id", params.orgId)
    .maybeSingle();

  const merge: MergeContact = {
    ...params.merge,
    sender_name: senderName,
    sender_email: senderEmail,
    booking_link: (orgRow?.booking_url as string | null) ?? "",
  };
  const renderedSubject = renderTemplate(params.subject, merge);
  const renderedHtml = renderTemplate(params.bodyHtml, merge);

  // The thread's existing header ids, oldest first, become In-Reply-To/References.
  const { data: priorRows } = await params.supabase
    .from("messages")
    .select("message_id")
    .eq("conversation_id", params.conversationId)
    .order("created_at", { ascending: true });
  const thread = buildThreadHeaders(
    newMessageId(senderEmail),
    ((priorRows ?? []) as { message_id: string | null }[]).map((r) => r.message_id)
  );

  const res = await sendViaMailbox(params.supabase, mailbox, {
    from,
    to: params.to,
    cc: params.cc,
    bcc: params.bcc,
    subject: renderedSubject,
    html: wrapEmail(renderedHtml, { preheader: makeSnippet({ html: renderedHtml }) }),
    replyTo,
    headers: threadHeaderFields(thread),
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
    cc_addresses: params.cc?.length ? params.cc : null,
    bcc_addresses: params.bcc?.length ? params.bcc : null,
    subject: renderedSubject,
    body_html: renderedHtml,
    snippet: makeSnippet({ html: renderedHtml }),
    user_id: params.userId,
    provider_message_id: res.id || null,
    message_id: thread.messageId,
    in_reply_to: thread.inReplyTo,
  });
  return error ? error.message : null;
}

/**
 * Send a reply within an existing conversation. The subject is the thread's own
 * ("Re: …") unless the sender deliberately renamed it in the composer, so a
 * reply stays in one thread instead of forking a new one on the other side.
 */
export async function sendEmail(
  conversationId: string,
  _prev: SendState,
  fd: FormData
): Promise<SendState> {
  const { supabase, org, userId } = await requireContext();

  const { data: conv } = await supabase
    .from("conversations")
    .select(
      "id, contact_id, subject, status, contacts(first_name, last_name, email, phone, title, lifecycle_stage, companies(name))"
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return { error: "Conversation not found." };

  const c = conv as unknown as {
    contact_id: string;
    subject: string | null;
    status: ConversationStatus;
    contacts: ContactRow | null;
  };
  const contact = c.contacts;
  const to = contact?.email?.trim();
  if (!to) return { error: "This contact has no email address." };

  const typed = String(fd.get("subject") ?? "").trim();
  const subject = typed || replySubject(c.subject);
  const bodyHtml = String(fd.get("body") ?? "").trim();
  if (!subject) return { error: "Add a subject." };
  if (!bodyHtml || bodyHtml === "<p></p>") return { error: "Write a message first." };

  const cc = resolveCopyList(String(fd.get("cc") ?? ""), "Cc", [to]);
  if (cc.error) return { error: cc.error };
  const bcc = resolveCopyList(String(fd.get("bcc") ?? ""), "Bcc", [
    to,
    ...cc.addresses,
  ]);
  if (bcc.error) return { error: bcc.error };

  const error = await deliverEmail({
    supabase,
    orgId: org.id,
    userId,
    conversationId,
    contactId: c.contact_id,
    to,
    cc: cc.addresses,
    bcc: bcc.addresses,
    merge: mergeFrom(contact),
    subject,
    bodyHtml,
  });
  if (error) return { error };

  // A thread we're still talking in isn't closed — reopen it like a ticket.
  if (c.status === "closed") {
    await supabase
      .from("conversations")
      .update({ status: "open" })
      .eq("id", conversationId);
  }

  revalidatePath("/inbox");
  return { ok: true };
}

const CONTACT_SELECT =
  "id, company_id, first_name, last_name, email, phone, title, lifecycle_stage, companies(name)";

/** Escape LIKE wildcards so `ilike` is a case-insensitive *exact* match. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Resolve the recipient of a compose: an explicitly picked contact, or a raw
 * address typed into the To field. A typed address that already belongs to a
 * contact reuses it (so the mail joins that contact's thread rather than
 * forking a duplicate); a genuinely new one gets a contact created, because a
 * thread hangs off a contact and an email you sent has to live somewhere.
 */
async function resolveRecipient(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  contactId: string,
  toEmail: string
): Promise<{ contact?: ContactRow & { id: string; company_id: string | null }; error?: string }> {
  if (contactId) {
    const { data } = await supabase
      .from("contacts")
      .select(CONTACT_SELECT)
      .eq("id", contactId)
      .maybeSingle();
    if (!data) return { error: "Contact not found." };
    return { contact: data as unknown as ContactRow & { id: string; company_id: string | null } };
  }

  const email = toEmail.toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Enter a contact or a valid email address." };

  const { data: match } = await supabase
    .from("contacts")
    .select(CONTACT_SELECT)
    .eq("org_id", orgId)
    .ilike("email", escapeLike(email))
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (match) {
    return { contact: match as unknown as ContactRow & { id: string; company_id: string | null } };
  }

  const { data: created, error } = await supabase
    .from("contacts")
    .insert({
      org_id: orgId,
      email,
      lifecycle_stage: "new",
      owner_id: userId,
      source: "inbox",
    })
    .select(CONTACT_SELECT)
    .maybeSingle();
  if (error || !created) {
    return { error: error?.message || "Could not create a contact for that address." };
  }
  return { contact: created as unknown as ContactRow & { id: string; company_id: string | null } };
}

/**
 * Send a new email *inside a thread*: if the recipient's conversation already
 * exists it is reused as-is — its subject is the thread's identity and is never
 * overwritten by this send — and a closed one reopens. Only a recipient with no
 * thread yet gets one created, titled with this subject.
 *
 * The recipient may be a picked contact or an address typed into the To field;
 * an unknown address gets a contact so the draft still lands in a real thread
 * rather than vanishing into a one-off send.
 */
export async function composeEmail(
  _prev: ComposeState,
  fd: FormData
): Promise<ComposeState> {
  const { supabase, org, userId } = await requireContext();

  const pickedId = String(fd.get("contact_id") ?? "").trim();
  const typedEmail = String(fd.get("to_email") ?? "").trim();
  if (!pickedId && !typedEmail) return { error: "Add a recipient." };

  const subject = String(fd.get("subject") ?? "").trim();
  const bodyHtml = String(fd.get("body") ?? "").trim();
  if (!subject) return { error: "Add a subject." };
  if (!bodyHtml || bodyHtml === "<p></p>") return { error: "Write a message first." };

  const { contact: c, error: recipientError } = await resolveRecipient(
    supabase,
    org.id,
    userId,
    pickedId,
    typedEmail
  );
  if (recipientError || !c) return { error: recipientError ?? "Contact not found." };
  const contactId = c.id;

  const to = c.email?.trim();
  if (!to) return { error: "This contact has no email address." };

  const cc = resolveCopyList(String(fd.get("cc") ?? ""), "Cc", [to]);
  if (cc.error) return { error: cc.error };
  const bcc = resolveCopyList(String(fd.get("bcc") ?? ""), "Bcc", [
    to,
    ...cc.addresses,
  ]);
  if (bcc.error) return { error: bcc.error };

  // Find the contact's existing email thread (unique per org+contact+channel)
  // and send into it; create one only when there is none.
  const { data: existing } = await supabase
    .from("conversations")
    .select("id, status")
    .eq("org_id", org.id)
    .eq("contact_id", contactId)
    .eq("channel", "email")
    .maybeSingle();

  let conversationId: string;
  if (existing) {
    const e = existing as { id: string; status: ConversationStatus };
    conversationId = e.id;
    if (e.status === "closed") {
      await supabase
        .from("conversations")
        .update({ status: "open" })
        .eq("id", conversationId);
    }
  } else {
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .insert({
        org_id: org.id,
        contact_id: contactId,
        company_id: c.company_id ?? null,
        channel: "email",
        subject,
      })
      .select("id")
      .maybeSingle();
    if (convErr || !conv) {
      return { error: convErr?.message || "Could not open a conversation." };
    }
    conversationId = (conv as { id: string }).id;
  }
  const error = await deliverEmail({
    supabase,
    orgId: org.id,
    userId,
    conversationId,
    contactId,
    to,
    cc: cc.addresses,
    bcc: bcc.addresses,
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
  // Server actions are public endpoints; ignore an invalid enum at runtime.
  if (!CONVERSATION_STATUSES.includes(status)) return;
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
