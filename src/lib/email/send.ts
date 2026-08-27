// Single entry point for sending one email "from" a mailbox. Routes to the
// mailbox's connected account (Gmail/Outlook) when it has stored OAuth tokens,
// otherwise falls back to the global delivery provider (Resend/mock). Owns token
// refresh + persistence and records auth failures so the UI can prompt a
// reconnect. Server-only (decrypts tokens, uses the client secret).
//
// Called with whichever Supabase client the caller already holds:
//   - server actions (inbox/settings): the request client (RLS, same org).
//   - the Inngest engine: the service-role admin client.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getEmailProvider,
  GmailProvider,
  OutlookProvider,
  type EmailProvider,
  type SendMessage,
  type SendResult,
} from "./provider";
import { decryptToken, encryptToken } from "./mailbox-crypto";
import {
  isMailboxProviderType,
  type MailboxProviderType,
} from "./mailbox-providers";
import { mailboxOAuthClient, refreshTokens } from "./mailbox-oauth";

/** The mailbox fields sendViaMailbox needs. A subset of the full row. */
export type MailboxSender = {
  id: string;
  provider: string;
  oauth_email: string | null;
  access_token: string | null; // encrypted
  refresh_token: string | null; // encrypted
  token_expires_at: string | null; // ISO
};

/** Columns to select wherever a row will be handed to sendViaMailbox. */
export const MAILBOX_SENDER_COLUMNS =
  "id, provider, oauth_email, access_token, refresh_token, token_expires_at";

/** True when the mailbox is a connected account with usable stored tokens. */
export function isConnectedMailbox(m: MailboxSender | null | undefined): boolean {
  return !!(
    m &&
    isMailboxProviderType(m.provider) &&
    m.oauth_email &&
    m.access_token
  );
}

/** Rebuild a "Name <email>" from-line so its address is the connected account. */
function withMailboxAddress(from: string, address: string): string {
  const name = from.includes("<") ? from.slice(0, from.indexOf("<")).trim() : "";
  return name ? `${name} <${address}>` : address;
}

function providerFor(type: MailboxProviderType, accessToken: string): EmailProvider {
  return type === "gmail"
    ? new GmailProvider(accessToken)
    : new OutlookProvider(accessToken);
}

/** Refresh window: renew if the token expires within this many ms. */
const EXPIRY_SKEW_MS = 60_000;

/**
 * Whether a failed send is worth trying again shortly.
 *
 * This matters because the campaign engine records a failure and *advances* to
 * the next step. A transient rate-limit from Gmail would therefore burn that
 * step permanently: the contact never receives the email and the sequence moves
 * on as though it had. Callers use this to retry instead.
 *
 * Retryable: 429 (rate limited — the provider rejected it, so nothing was
 * delivered), 5xx (provider-side fault), and transport errors that never got an
 * HTTP status at all.
 *
 * Not retryable: 4xx like 400/403 (malformed or refused — it will fail
 * identically next time) and 401, which sendViaMailbox has already retried once
 * against a force-refreshed token.
 *
 * A 5xx is not strictly provably undelivered — `messages.send` is not
 * idempotent, so a retry could in principle duplicate a message the provider
 * accepted but failed to acknowledge. That is the better risk: a duplicate is
 * visible and recoverable, whereas the current behavior drops the email
 * silently and no one ever finds out.
 */
export function isRetryableSendFailure(res: SendResult): boolean {
  if (res.status !== "failed") return false;
  const error = res.error ?? "";
  const status = /^(\d{3})/.exec(error)?.[1];
  if (!status) return true; // no HTTP status → transport/network error
  if (status === "429") return true;
  return status.startsWith("5");
}

/**
 * Ensure a live access token, refreshing + persisting when stale. Returns the
 * usable token, or null when the mailbox can no longer authenticate (in which
 * case connect_error has been written).
 */
async function ensureAccessToken(
  db: SupabaseClient,
  m: MailboxSender,
  type: MailboxProviderType,
): Promise<string | null> {
  const access = m.access_token ? decryptToken(m.access_token) : null;
  const expiresAt = m.token_expires_at ? Date.parse(m.token_expires_at) : 0;
  const fresh = access && expiresAt && expiresAt - Date.now() > EXPIRY_SKEW_MS;
  if (fresh) return access;

  const refresh = m.refresh_token ? decryptToken(m.refresh_token) : null;
  const client = mailboxOAuthClient(type);
  if (!refresh || !client) {
    // No way to renew — if we still hold a token, try it; else fail hard.
    if (access) return access;
    await markError(db, m.id, "This mailbox needs to be reconnected.");
    return null;
  }

  try {
    const t = await refreshTokens({ type, refreshToken: refresh, client });
    const update: Record<string, unknown> = {
      access_token: encryptToken(t.accessToken),
      token_expires_at: t.expiresInSec
        ? new Date(Date.now() + t.expiresInSec * 1000).toISOString()
        : null,
      connect_error: null,
    };
    if (t.refreshToken && t.refreshToken !== refresh)
      update.refresh_token = encryptToken(t.refreshToken);
    await db.from("mailboxes").update(update).eq("id", m.id);
    return t.accessToken;
  } catch (e) {
    await markError(db, m.id, `Token refresh failed: ${(e as Error).message}`);
    return null;
  }
}

async function markError(db: SupabaseClient, id: string, error: string): Promise<void> {
  await db.from("mailboxes").update({ connect_error: error }).eq("id", id);
}

/**
 * Confirm a connected mailbox can still authenticate, by forcing a token
 * refresh. On failure `connect_error` is written (by ensureAccessToken), which
 * is what surfaces the Reconnect prompt in settings.
 *
 * Without this, a revoked or expired mailbox keeps showing a green "Connected"
 * badge until the next campaign happens to fail on it — tokens are otherwise
 * only refreshed in the course of an actual send. Returns false for a mailbox
 * that isn't a connected account at all (nothing to check).
 */
export async function revalidateMailbox(
  db: SupabaseClient,
  mailbox: MailboxSender,
): Promise<boolean> {
  if (!isConnectedMailbox(mailbox) || !isMailboxProviderType(mailbox.provider))
    return false;
  // token_expires_at: null forces the refresh rather than trusting the stored
  // expiry — a token revoked at the provider looks unexpired to us.
  const token = await ensureAccessToken(
    db,
    { ...mailbox, token_expires_at: null },
    mailbox.provider,
  );
  return !!token;
}

/**
 * Send one message. When `mailbox` is a connected Gmail/Outlook account, sends
 * through it (from is forced to the connected address); otherwise delegates to
 * the global provider. Always resolves to a SendResult — a hard failure is
 * reported, never thrown, so callers record it in their funnels.
 */
export async function sendViaMailbox(
  db: SupabaseClient,
  mailbox: MailboxSender | null | undefined,
  msg: SendMessage,
): Promise<SendResult> {
  if (!mailbox || !isConnectedMailbox(mailbox) || !isMailboxProviderType(mailbox.provider)) {
    return getEmailProvider().send(msg);
  }
  const type = mailbox.provider;

  const token = await ensureAccessToken(db, mailbox, type);
  if (!token) return { id: "", status: "failed", error: "Mailbox not connected." };

  const outgoing: SendMessage = {
    ...msg,
    from: withMailboxAddress(msg.from, mailbox.oauth_email!),
  };

  let res = await providerFor(type, token).send(outgoing);

  // Retry once on an auth error with a force-refreshed token: the stored token
  // may have been revoked/expired ahead of token_expires_at.
  if (res.status === "failed" && /^401/.test(res.error ?? "")) {
    const refreshed = await ensureAccessToken(
      db,
      { ...mailbox, token_expires_at: null }, // force refresh
      type,
    );
    if (refreshed) res = await providerFor(type, refreshed).send(outgoing);
  }

  if (res.status === "failed" && /^40[13]/.test(res.error ?? "")) {
    await markError(db, mailbox.id, `Send rejected: ${res.error}`);
  }
  return res;
}
