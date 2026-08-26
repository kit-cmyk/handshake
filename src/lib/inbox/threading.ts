// Pure helpers for RFC 822 email threading — the bit that makes a Handshake
// thread and the recipient's mail thread the same thread (Zendesk-style).
//
// Every outbound message gets a Message-ID we mint. When we send into a thread
// that already has messages, we also send In-Reply-To (the newest prior id) and
// References (the id chain), which is what Gmail/Outlook/Apple Mail use to file
// the mail under the existing conversation instead of starting a new one. The
// same chain lets the inbound webhook resolve which thread a reply belongs to.
//
// Side-effect free apart from newMessageId's uuid — unit-testable.

/** How many ids to keep in References. Enough to thread, short enough to send. */
const MAX_REFERENCES = 20;

/**
 * Mint a Message-ID for an outbound email, stored and sent bare (no angle
 * brackets — the header writer adds them). The domain half comes from the
 * sending address so the id is plausible to spam filters.
 */
export function newMessageId(fromAddress: string): string {
  const at = fromAddress.lastIndexOf("@");
  const domain =
    at >= 0 ? fromAddress.slice(at + 1).replace(/[>\s]/g, "") : "handshake.local";
  return `${crypto.randomUUID()}@${domain || "handshake.local"}`;
}

/** Strip the angle brackets and whitespace a raw header value arrives with. */
export function normalizeMessageId(value: string | null | undefined): string | null {
  const bare = (value ?? "").trim().replace(/^<|>$/g, "").trim();
  return bare || null;
}

/**
 * Parse a References (or In-Reply-To) header into bare ids, newest last. The
 * header is a space-separated list of `<id>` tokens; some clients use commas.
 */
export function parseReferences(value: string | null | undefined): string[] {
  if (!value) return [];
  const ids = value.match(/<[^<>]+>/g);
  const raw = ids ?? value.split(/[\s,]+/);
  return raw
    .map((v) => normalizeMessageId(v))
    .filter((v): v is string => !!v);
}

export type ThreadHeaders = {
  /** This message's own id, bare. */
  messageId: string;
  /** The id this message replies to, bare — null for the first in a thread. */
  inReplyTo: string | null;
  /** The full chain, oldest first, excluding this message's own id. */
  references: string[];
};

/**
 * Build the threading headers for the next outbound message in a thread.
 * `priorIds` are the thread's existing message ids, oldest first (a message
 * without a stored id — e.g. sent before migration 0038 — is simply skipped).
 */
export function buildThreadHeaders(
  messageId: string,
  priorIds: (string | null | undefined)[]
): ThreadHeaders {
  const chain = priorIds
    .map((id) => normalizeMessageId(id))
    .filter((id): id is string => !!id);
  const trimmed = chain.slice(-MAX_REFERENCES);
  return {
    messageId,
    inReplyTo: trimmed.length ? trimmed[trimmed.length - 1] : null,
    references: trimmed,
  };
}

/** Render ThreadHeaders as MIME header lines a provider can send verbatim. */
export function threadHeaderFields(t: ThreadHeaders): Record<string, string> {
  const headers: Record<string, string> = { "Message-ID": `<${t.messageId}>` };
  if (t.inReplyTo) headers["In-Reply-To"] = `<${t.inReplyTo}>`;
  if (t.references.length) {
    headers.References = t.references.map((id) => `<${id}>`).join(" ");
  }
  return headers;
}

/**
 * The subject a reply should carry: the thread's own subject, prefixed once
 * with "Re:". Mail clients match on the prefix-stripped subject, so stacking
 * "Re: Re:" only makes the thread look broken.
 */
export function replySubject(threadSubject: string | null | undefined): string {
  const base = (threadSubject ?? "").trim();
  if (!base) return "";
  return /^re\s*:/i.test(base) ? base : `Re: ${base}`;
}
