// Opaque-ish unsubscribe token. Not cryptographically signed (MVP) — encodes
// the contact + campaign so the public route can resolve who's opting out.

export function makeUnsubToken(contactId: string, campaignId: string): string {
  return Buffer.from(`${contactId}:${campaignId}`).toString("base64url");
}

export function parseUnsubToken(
  token: string
): { contactId: string; campaignId: string | null } | null {
  try {
    const [contactId, campaignId] = Buffer.from(token, "base64url")
      .toString("utf8")
      .split(":");
    if (!contactId) return null;
    return { contactId, campaignId: campaignId || null };
  } catch {
    return null;
  }
}

export function unsubUrl(contactId: string, campaignId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base}/api/unsubscribe?token=${makeUnsubToken(contactId, campaignId)}`;
}
