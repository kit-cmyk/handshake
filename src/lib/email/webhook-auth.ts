import crypto from "node:crypto";

// Shared-secret guard for the public email webhooks. Providers must send
// EMAIL_WEBHOOK_SECRET as `x-webhook-secret` (or Bearer). These endpoints use
// the service-role client (RLS-bypassing), so the guard MUST fail closed in
// production: a missing secret rejects everything rather than accepting forged
// bounces/replies/inbound. The guard is open only in local/mock dev (no
// production build) so E2E tests can post synthetic events without config.

export function verifyWebhookSecret(request: Request): boolean {
  const expected = process.env.EMAIL_WEBHOOK_SECRET;
  if (!expected) {
    // Fail closed in production; open only for local/dev/test.
    return process.env.NODE_ENV !== "production";
  }

  const header =
    request.headers.get("x-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  // Compare byte length (not string length — multibyte secrets differ) before
  // timingSafeEqual, which throws on unequal-length buffers.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
