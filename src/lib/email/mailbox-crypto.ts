// AES-256-GCM encryption for connected-mailbox OAuth tokens at rest. A mailbox's
// access/refresh tokens are long-lived bearer credentials to the user's Gmail /
// Outlook account and must never be stored in plaintext. This mirrors
// src/lib/crm/crypto.ts but is keyed off its OWN secret (MAILBOX_TOKEN_SECRET)
// so mailbox and CRM token stores can be rotated independently. Server-only.

import crypto from "node:crypto";

const PREFIX = "v1"; // token format version, so the scheme can evolve

/**
 * 32-byte key derived from MAILBOX_TOKEN_SECRET. Required in production — a
 * missing secret there is fatal rather than silently using a guessable default
 * that would make every stored token trivially decryptable. A dev default keeps
 * local dev and tests working without configuration.
 */
function key(): Buffer {
  const s = process.env.MAILBOX_TOKEN_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "MAILBOX_TOKEN_SECRET must be set in production (encrypts stored mailbox OAuth tokens).",
      );
    }
    return crypto.createHash("sha256").update("dev-mailbox-token-secret").digest();
  }
  // Hash to exactly 32 bytes regardless of the secret's length/encoding.
  return crypto.createHash("sha256").update(s).digest();
}

/** Encrypt a plaintext token to `v1.<iv>.<tag>.<ciphertext>` (all base64url). */
export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ct.toString("base64url"),
  ].join(".");
}

/** Decrypt a token produced by encryptToken; returns null if malformed/tampered. */
export function decryptToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const ct = Buffer.from(parts[3], "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(ct), decipher.final()]);
    return out.toString("utf8");
  } catch {
    // Bad key (rotated secret), tampering, or corruption — treat as no token.
    return null;
  }
}
