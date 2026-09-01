// Recording an automated send (campaign / workflow) into the Inbox.
//
// One-off inbox sends write their own `messages` row inside the server action
// that sends them. The Inngest engines had no such path, so a campaign or
// workflow email showed up in the thread only as a derived "Email sent" system
// line — the reader could see that *something* went out but not what it said.
// This module gives both engines the same treatment: find (or open) the
// contact's email conversation and append the outbound message to it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { makeSnippet } from "./inbound";

/**
 * Find the contact's email thread, creating it when this is the first message.
 * Conversations are unique per (org, contact, channel), so a lost insert race
 * is resolved by re-reading rather than by failing. Returns null if the thread
 * could neither be found nor created.
 */
async function ensureConversation(
  admin: SupabaseClient,
  params: { orgId: string; contactId: string; subject: string | null }
): Promise<string | null> {
  const find = async () => {
    const { data } = await admin
      .from("conversations")
      .select("id")
      .eq("org_id", params.orgId)
      .eq("contact_id", params.contactId)
      .eq("channel", "email")
      .maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  };

  const existing = await find();
  if (existing) return existing;

  // Denormalized onto the conversation so the Inbox's company tab and filters
  // stay a single-table read (see 0020_inbox.sql).
  const { data: contact } = await admin
    .from("contacts")
    .select("company_id")
    .eq("id", params.contactId)
    .maybeSingle();

  const { data: created } = await admin
    .from("conversations")
    .insert({
      org_id: params.orgId,
      contact_id: params.contactId,
      company_id: (contact as { company_id: string | null } | null)?.company_id ?? null,
      channel: "email",
      subject: params.subject,
    })
    .select("id")
    .maybeSingle();
  if (created) return (created as { id: string }).id;

  // Insert failed — most likely the unique constraint, because a concurrent
  // send opened the same thread first. Read it back.
  return find();
}

/**
 * Append an automated outbound email to the contact's Inbox thread.
 *
 * `bodyHtml` must be the *rendered but untracked* body: no open pixel, no
 * rewritten click-tracking links, no unsubscribe footer. The conversation pane
 * renders outbound bodies as live HTML, so storing the delivered version would
 * make a teammate opening the thread register as the recipient opening the
 * email — the CRM would quietly manufacture its own analytics.
 *
 * Bookkeeping, not delivery: every failure is swallowed. These calls sit inside
 * the engines' `record` steps alongside the `sent` event insert, and throwing
 * here would retry that whole step and duplicate the event.
 */
export async function recordOutboundMessage(
  admin: SupabaseClient,
  params: {
    orgId: string;
    contactId: string;
    from: string;
    to: string;
    subject: string;
    bodyHtml: string;
    /** The delivery provider's id — correlates with `events.metadata.message_id`. */
    providerMessageId?: string | null;
    campaignId?: string | null;
    workflowId?: string | null;
  }
): Promise<void> {
  try {
    const conversationId = await ensureConversation(admin, {
      orgId: params.orgId,
      contactId: params.contactId,
      subject: params.subject || null,
    });
    if (!conversationId) return;

    await admin.from("messages").insert({
      org_id: params.orgId,
      conversation_id: conversationId,
      contact_id: params.contactId,
      direction: "outbound",
      channel: "email",
      from_address: params.from,
      to_address: params.to,
      subject: params.subject || null,
      body_html: params.bodyHtml || null,
      snippet: makeSnippet({ html: params.bodyHtml }),
      // No user_id: nobody pressed send. `campaign_id`/`workflow_id` are what
      // the thread uses to label the bubble as automated.
      user_id: null,
      provider_message_id: params.providerMessageId || null,
      campaign_id: params.campaignId ?? null,
      workflow_id: params.workflowId ?? null,
    });
  } catch {
    // Deliberately silent — see the note above.
  }
}
