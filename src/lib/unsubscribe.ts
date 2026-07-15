// Unsubscribe token. HMAC-signed (shared codec) so the public unsubscribe route
// can trust the encoded contact + campaign without a DB lookup and without the
// token being forgeable/enumerable — an attacker can no longer craft a valid
// token for an arbitrary contact id.

import { encodeToken, decodeToken } from "@/lib/crypto-token";

type UnsubPayload = { c: string; ca: string };

export function makeUnsubToken(contactId: string, campaignId: string): string {
  return encodeToken({ c: contactId, ca: campaignId } satisfies UnsubPayload);
}

export function parseUnsubToken(
  token: string
): { contactId: string; campaignId: string | null } | null {
  const p = decodeToken<UnsubPayload>(token);
  if (!p || !p.c) return null;
  return { contactId: p.c, campaignId: p.ca || null };
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
