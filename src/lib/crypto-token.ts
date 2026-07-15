// Shared HMAC-signed token codec. Used by email tracking (open/click/reply) and
// the unsubscribe link so the public routes can trust an encoded payload without
// a DB lookup and without it being forgeable.

import crypto from "node:crypto";

/**
 * Signing secret. Requires TRACKING_SECRET in production — it MUST NOT silently
 * fall back to the service-role key (entangles rotation, leaks the DB master
 * key into a signing oracle) or to a public literal (makes every token
 * forgeable). A weak dev-only default is allowed outside production so local
 * dev and tests work without configuration.
 */
function secret(): string {
  const s = process.env.TRACKING_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "TRACKING_SECRET must be set in production (used to sign tracking and unsubscribe tokens)."
    );
  }
  return "dev-tracking-secret";
}

export function signBody(body: string): string {
  return crypto
    .createHmac("sha256", secret())
    .update(body)
    .digest("base64url")
    .slice(0, 24);
}

/** Encode a JSON payload as `<base64url(body)>.<signature>`. */
export function encodeToken(payload: unknown): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signBody(body)}`;
}

/** Decode and verify a token; returns null if the signature is missing/invalid. */
export function decodeToken<T>(token: string): T | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  // Constant-time compare against the recomputed signature.
  const expected = signBody(body);
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
