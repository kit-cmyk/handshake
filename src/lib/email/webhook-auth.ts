import crypto from "node:crypto";

// Shared-secret guard for the public email webhooks. Set EMAIL_WEBHOOK_SECRET
// in production; providers must send it as `x-webhook-secret` (or Bearer). When
// the env var is unset (local/mock dev) the guard is open so E2E tests can post
// synthetic events without configuration.

export function verifyWebhookSecret(request: Request): boolean {
  const expected = process.env.EMAIL_WEBHOOK_SECRET;
  if (!expected) return true; // dev/mock: no secret configured

  const header =
    request.headers.get("x-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (header.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
