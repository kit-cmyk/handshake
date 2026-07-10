import crypto from "node:crypto";

// Shared-secret guard for the public email webhooks. Set EMAIL_WEBHOOK_SECRET
// in production; providers must send it as `x-webhook-secret` (or Bearer).
//
// Fail CLOSED in production: if the secret is unset there, reject every request
// rather than silently authenticating the world (a forgotten env var must not
// disable webhook auth). Outside production (local/mock dev, E2E) an unset
// secret leaves the guard open so synthetic events can be posted without config.

export function verifyWebhookSecret(request: Request): boolean {
  const expected = process.env.EMAIL_WEBHOOK_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";

  const header =
    request.headers.get("x-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (header.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
