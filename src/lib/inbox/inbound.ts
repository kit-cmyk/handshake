// Pure helpers for ingesting an inbound email into a message row. The inbound
// webhook resolves the org/contact (via the signed reply token or a sender-email
// match) and then calls buildInboundMessage; the conversation_id is attached by
// the caller after upserting the conversation. No side effects — unit-testable.

/** Strip HTML to a plain-text approximation for previews. */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** A short preview string, preferring plain text over stripped HTML. */
export function makeSnippet(
  input: { text?: string | null; html?: string | null },
  max = 140
): string {
  const raw = input.text?.trim() || (input.html ? stripHtml(input.html) : "");
  if (raw.length <= max) return raw;
  return raw.slice(0, max - 1).trimEnd() + "…";
}

export type ParsedInboundEmail = {
  from?: string | null;
  to?: string | null;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  messageId?: string | null;
};

export type InboundContext = {
  orgId: string;
  contactId: string;
  campaignId?: string | null;
};

/**
 * Build the message row (minus conversation_id) for an inbound email. The
 * caller upserts the conversation first, then inserts `{ ...row, conversation_id }`.
 */
export function buildInboundMessage(
  email: ParsedInboundEmail,
  ctx: InboundContext
) {
  const body_text = email.text?.trim() || null;
  const body_html = email.html?.trim() || null;
  return {
    org_id: ctx.orgId,
    contact_id: ctx.contactId,
    direction: "inbound" as const,
    channel: "email" as const,
    from_address: email.from ?? null,
    to_address: email.to ?? null,
    subject: email.subject ?? null,
    body_html,
    body_text,
    snippet: makeSnippet({ text: body_text, html: body_html }),
    provider_message_id: email.messageId ?? null,
    campaign_id: ctx.campaignId ?? null,
  };
}
