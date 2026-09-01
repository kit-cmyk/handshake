"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";
import { getEmailProvider, isEmailDeliveryConfigured } from "@/lib/email/provider";
import { wrapEmail } from "@/lib/email/layout";
import {
  sendViaMailbox,
  revalidateMailbox,
  isConnectedMailbox,
  MAILBOX_SENDER_COLUMNS,
  type MailboxSender,
} from "@/lib/email/send";
import { decryptToken } from "@/lib/email/mailbox-crypto";
import { recordSendUsage } from "@/lib/email/send-cap";
import { revokeMailboxAccess } from "@/lib/email/mailbox-oauth";
import {
  dailyLimitCeiling,
  isMailboxProviderType,
  MAILBOX_PROVIDERS,
  mailboxProviderLabel,
} from "@/lib/email/mailbox-providers";

export type MailboxState = {
  ok?: boolean;
  error?: string;
  /** Which input the error belongs under, so forms can render it there. */
  field?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function addMailbox(
  _prev: MailboxState,
  fd: FormData
): Promise<MailboxState> {
  const { supabase, org, userId } = await requireContext();

  const email = String(fd.get("email") ?? "").trim();
  const display_name = String(fd.get("display_name") ?? "").trim() || null;
  const daily_limit = Math.max(
    1,
    Number(String(fd.get("daily_limit") ?? "200")) || 200
  );

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address.", field: "email" };

  // An address-only mailbox sends through the global delivery provider, which
  // will only accept a domain the org has verified with it. Nobody can verify
  // gmail.com or outlook.com, so this row could never send — the provider
  // returns a 403 on the first attempt and the mailbox sits there looking
  // configured. Refuse it here and point at the flow that does work: connecting
  // the account itself, which sends through the provider's own API and needs no
  // domain verification.
  const personal = MAILBOX_PROVIDERS.find((p) =>
    p.quota.personalDomains.includes(email.split("@")[1]?.toLowerCase() ?? "")
  );
  if (personal) {
    return {
      field: "email",
      error:
        `${mailboxProviderLabel(personal.type)} addresses can't be added this way — ` +
        `a delivery provider will reject them because nobody can verify that domain. ` +
        `Use "Connect ${personal.label}" instead to send through the account itself.`,
    };
  }

  const { error } = await supabase.from("mailboxes").insert({
    org_id: org.id,
    user_id: userId,
    // Record the delivery provider actually in use so the mailbox reflects
    // reality (e.g. "resend") rather than a hardcoded value.
    provider: getEmailProvider().name,
    email,
    display_name,
    daily_limit,
  });
  if (error) return { error: error.message };

  revalidatePath("/settings/mailboxes");
  return { ok: true };
}

export async function deleteMailbox(id: string): Promise<MailboxState> {
  const { supabase, org } = await requireContext();

  // Revoke at the provider BEFORE deleting the row. Afterwards we no longer
  // hold the tokens, so the grant on the user's Google account would survive
  // forever — while the confirmation dialog tells them we've forgotten our
  // access. Best-effort: a failed revoke still proceeds to the delete, since
  // the user asked to disconnect and blocking that would be worse.
  const { data: row } = await supabase
    .from("mailboxes")
    .select(MAILBOX_SENDER_COLUMNS)
    .eq("id", id)
    .eq("org_id", org.id)
    .maybeSingle();

  const sender = row as MailboxSender | null;
  if (sender && isConnectedMailbox(sender) && isMailboxProviderType(sender.provider)) {
    // Prefer the refresh token: revoking it drops the whole grant, whereas
    // revoking an access token leaves the refresh token able to mint another.
    const token =
      (sender.refresh_token ? decryptToken(sender.refresh_token) : null) ??
      (sender.access_token ? decryptToken(sender.access_token) : null);
    if (token) await revokeMailboxAccess({ type: sender.provider, token });
  }

  const { error } = await supabase
    .from("mailboxes")
    .delete()
    .eq("id", id)
    // Scoped by org, not just id: RLS spans every org the user belongs to.
    .eq("org_id", org.id);
  if (error) return { error: error.message };
  revalidatePath("/settings/mailboxes");
  return { ok: true };
}

/**
 * Send a test email through a mailbox, to the address of the person clicking.
 *
 * The only other way to discover a mailbox is broken is a campaign quietly
 * failing on it hours later — tokens are refreshed lazily, so a mailbox whose
 * access was revoked keeps showing a green "Connected" badge until something
 * tries to use it. This proves the whole path end to end: token refresh, the
 * provider's send API, and real delivery.
 */
export async function sendMailboxTest(id: string): Promise<MailboxState> {
  const { supabase, org, userEmail } = await requireContext();
  if (!userEmail)
    return { error: "Your account has no email address to send the test to." };

  const { data: row } = await supabase
    .from("mailboxes")
    .select(`email, display_name, connect_error, ${MAILBOX_SENDER_COLUMNS}`)
    .eq("id", id)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!row) return { error: "That mailbox no longer exists." };

  const mailbox = row as MailboxSender & {
    email: string;
    display_name: string | null;
    connect_error: string | null;
  };

  // Check authentication first so an expired connection reports "reconnect"
  // rather than a raw provider error from the send attempt.
  if (isConnectedMailbox(mailbox)) {
    const live = await revalidateMailbox(supabase, mailbox);
    if (!live)
      return {
        error: "This mailbox needs to be reconnected before it can send.",
      };
  }

  // A mailbox that isn't a connected account sends through the global delivery
  // provider — which, with no API key configured, is the mock: it logs the
  // message and reports "sent". Letting that render as a passed test is worse
  // than failing, because the entire purpose of this button is to prove real
  // delivery, and a green result sends people hunting for the fault anywhere
  // except the one place it is.
  if (!isConnectedMailbox(mailbox) && !isEmailDeliveryConfigured()) {
    return {
      error:
        "Email delivery isn't configured on this server, so no message was sent. " +
        "Set EMAIL_PROVIDER_API_KEY, or connect a Gmail/Outlook account to send through it.",
    };
  }

  const from = mailbox.display_name
    ? `${mailbox.display_name} <${mailbox.email}>`
    : mailbox.email;

  const res = await sendViaMailbox(supabase, mailbox, {
    from,
    to: userEmail,
    subject: "Handshake test email",
    html: wrapEmail(
      `<p>This is a test from Handshake.</p>
       <p>If it reached you, <strong>${mailbox.email}</strong> can send
       campaign and workflow email.</p>`,
      { preheader: "Your Handshake mailbox is working." },
    ),
  });

  if (res.status === "failed")
    return { error: res.error || "The provider rejected the test send." };

  // Counted but not capped — the provider charged this message against the
  // account's daily quota, so our number has to know about it too. See
  // recordSendUsage.
  if (isConnectedMailbox(mailbox))
    await recordSendUsage(supabase, { orgId: org.id, mailboxId: id });

  // A successful send proves the mailbox works: clear any stale warning so it
  // doesn't linger after the user has fixed things. Not limited to connected
  // accounts — `markError` writes connect_error for an address-only row too
  // (that's how the delivery provider's "domain is not verified" 403 gets
  // recorded), and leaving that behind after a passing test would be reporting
  // a fault we just disproved.
  if (mailbox.connect_error) {
    await supabase
      .from("mailboxes")
      .update({ connect_error: null })
      .eq("id", id)
      .eq("org_id", org.id);
  }

  revalidatePath("/settings/mailboxes");
  return { ok: true };
}

/**
 * Change a mailbox's daily send cap.
 *
 * Until now the cap could only be chosen when an address-only mailbox was
 * created, and never at all for a connected account — which meant a connected
 * Gmail was stuck on whatever it was given at connect time, with no way to dial
 * it back after a deliverability scare or up after the domain warmed.
 *
 * For a connected account the value is clamped to the provider's own ceiling:
 * above it the provider simply starts rejecting messages, so a higher number
 * would not buy more sends, it would only move the failure from our orderly
 * pause to a mid-sequence provider error.
 */
export async function updateMailboxLimit(
  id: string,
  limit: number
): Promise<MailboxState> {
  const { supabase, org } = await requireContext();
  if (!["owner", "admin"].includes(org.role))
    return { error: "Only workspace admins can change a mailbox." };

  const { data: row } = await supabase
    .from("mailboxes")
    .select("id, provider, oauth_email")
    .eq("id", id)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!row) return { error: "That mailbox no longer exists." };

  const m = row as { provider: string; oauth_email: string | null };
  let daily_limit = Math.max(1, Math.floor(Number(limit) || 0));
  if (m.oauth_email && isMailboxProviderType(m.provider)) {
    const ceiling = dailyLimitCeiling(m.provider, m.oauth_email);
    if (daily_limit > ceiling) daily_limit = ceiling;
  }

  const { error } = await supabase
    .from("mailboxes")
    .update({ daily_limit })
    .eq("id", id)
    .eq("org_id", org.id);
  if (error) return { error: error.message };

  revalidatePath("/settings/mailboxes");
  return { ok: true };
}
