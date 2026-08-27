// Tell apart the three kinds of mail that arrive at a reply-tracking address.
//
// The inbound webhook used to treat everything that reached
// `reply+<token>@<domain>` as a human reply: it recorded a `replied` event,
// halted the sequence, pinged Slack and fired reply workflows. Two very common
// kinds of mail are not replies at all:
//
//   - Out-of-office auto-responders. In cold outreach these are constant.
//     Treated as replies they stop the sequence for someone who never read it,
//     and tell the user "Jane replied" when Jane is on holiday.
//   - Delivery failure reports (DSNs). Logged as a reply, a dead address is
//     never suppressed, so the campaign keeps mailing it — the fastest way to
//     wreck a sending reputation.
//
// Classification is heuristic by nature: there is no header that reliably says
// "a human typed this". The rules below are the conservative, widely-implemented
// signals (RFC 3834 for auto-responders, RFC 3464 for delivery reports). When
// nothing matches we fall through to "reply", so the failure mode is the old
// behavior rather than a swallowed genuine reply.

export type InboundKind = "bounce" | "auto_reply" | "reply";

/** The subset of an inbound payload classification looks at. */
export type ClassifiableInbound = {
  from?: string | null;
  subject?: string | null;
  /** Raw headers, when the provider forwards them. Keys may be any case. */
  headers?: Record<string, string> | null;
  /** Some providers surface these individually instead of a headers map. */
  auto_submitted?: string | null;
  content_type?: string | null;
};

/** Case-insensitive header read, falling back to the top-level shorthands. */
function header(m: ClassifiableInbound, name: string): string {
  const direct = m.headers
    ? Object.entries(m.headers).find(
        ([k]) => k.toLowerCase() === name.toLowerCase(),
      )?.[1]
    : undefined;
  const shorthand =
    name.toLowerCase() === "auto-submitted"
      ? m.auto_submitted
      : name.toLowerCase() === "content-type"
        ? m.content_type
        : null;
  return (direct ?? shorthand ?? "").toString().trim();
}

/** Bare lowercase address out of a "Name <addr>" header value. */
function address(value: string | null | undefined): string {
  if (!value) return "";
  const m = /<([^>]+)>/.exec(value);
  return (m ? m[1] : value).trim().toLowerCase();
}

// Local-parts reserved for automated delivery reports (RFC 5321 §4.5.1 requires
// postmaster; mailer-daemon is the near-universal convention).
const BOUNCE_SENDERS = new Set([
  "mailer-daemon",
  "mailerdaemon",
  "postmaster",
  "no-reply-delivery",
]);

// Subjects used by the major providers when mail can't be delivered. Only
// English is covered — a localized DSN falls back to the header checks above it,
// which is why those come first.
const BOUNCE_SUBJECT =
  /^\s*(?:re:\s*)?(?:undeliverable|undelivered\s+mail|delivery\s+status\s+notification|returned\s+mail|mail\s+delivery\s+(?:failed|subsystem)|delivery\s+has\s+failed|failure\s+notice|address\s+not\s+found)/i;

const AUTO_SUBJECT =
  /^\s*(?:re:\s*)?(?:out\s+of\s+(?:the\s+)?office|automatic(?:al)?\s+reply|auto[-\s]?reply|autoreply|auto:|away\s+from\s+(?:my\s+)?(?:email|office|desk))/i;

/** True when the message is a delivery failure report rather than a person. */
function isBounce(m: ClassifiableInbound): boolean {
  // RFC 3464: a delivery status notification is a multipart/report.
  const contentType = header(m, "content-type").toLowerCase();
  if (contentType.includes("multipart/report") && contentType.includes("delivery-status"))
    return true;

  // Postfix/Exim stamp the failed address here; nothing else uses this header.
  if (header(m, "x-failed-recipients")) return true;

  const local = address(m.from).split("@")[0];
  if (BOUNCE_SENDERS.has(local)) return true;
  if (address(m.from).startsWith("mailer-daemon@")) return true;

  return BOUNCE_SUBJECT.test(m.subject ?? "");
}

/** True when a machine generated the message on the recipient's behalf. */
function isAutoReply(m: ClassifiableInbound): boolean {
  // RFC 3834: anything other than "no" means this was generated automatically.
  const autoSubmitted = header(m, "auto-submitted").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;

  // Pre-RFC conventions still emitted by Exchange, Zimbra and others.
  if (header(m, "x-autoreply")) return true;
  if (header(m, "x-autorespond")) return true;
  if (header(m, "x-auto-response-suppress")) return true;
  if (/auto[-_]?reply|auto[-_]?generated/i.test(header(m, "precedence")))
    return true;

  return AUTO_SUBJECT.test(m.subject ?? "");
}

/**
 * Classify an inbound message. Bounce is tested first: a DSN commonly carries
 * `Auto-Submitted: auto-replied` too, and mistaking one for an out-of-office
 * would skip the suppression that protects the sending reputation.
 */
export function classifyInbound(m: ClassifiableInbound): InboundKind {
  if (isBounce(m)) return "bounce";
  if (isAutoReply(m)) return "auto_reply";
  return "reply";
}
