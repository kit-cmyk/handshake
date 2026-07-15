// HMAC-signed unsubscribe token: `<base64url(contactId:campaignId)>.<sig>`, so
// the public route can trust the encoded contact without a forgeable, guessable
// link (a bare contact UUID previously let anyone craft a valid token).

import crypto from "node:crypto";

function secret(): string {
  return (
    process.env.TRACKING_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "dev-tracking-secret"
  );
}

function sign(body: string): string {
  return crypto
    .createHmac("sha256", secret())
    .update(body)
    .digest("base64url")
    .slice(0, 24);
}

export function makeUnsubToken(contactId: string, campaignId: string): string {
  const body = Buffer.from(`${contactId}:${campaignId}`).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decodeBody(
  body: string
): { contactId: string; campaignId: string | null } | null {
  try {
    const [contactId, campaignId] = Buffer.from(body, "base64url")
      .toString("utf8")
      .split(":");
    if (!contactId) return null;
    return { contactId, campaignId: campaignId || null };
  } catch {
    return null;
  }
}

export function parseUnsubToken(
  token: string
): { contactId: string; campaignId: string | null } | null {
  const dot = token.lastIndexOf(".");
  if (dot > 0) {
    // Signed token — verify before trusting.
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = sign(body);
    if (
      sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ) {
      return decodeBody(body);
    }
    return null;
  }
  // Legacy unsigned token (bare base64url) still present in already-sent mail.
  // Accepted so those unsubscribe links keep working; can be removed once old
  // campaigns have aged out.
  return decodeBody(token);
}

export function unsubUrl(contactId: string, campaignId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base}/api/unsubscribe?token=${makeUnsubToken(contactId, campaignId)}`;
}

/**
 * RFC 8058 one-click unsubscribe headers for bulk mail. Gmail/Yahoo bulk-sender
 * rules expect these; the mail client shows a native "Unsubscribe" control that
 * POSTs `List-Unsubscribe=One-Click` to the URL (handled by the route's POST).
 */
export function unsubHeaders(
  contactId: string,
  campaignId: string
): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubUrl(contactId, campaignId)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
