"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";
import { getEmailProvider } from "@/lib/email/provider";
import { wrapEmail } from "@/lib/email/layout";
import {
  sendViaMailbox,
  revalidateMailbox,
  isConnectedMailbox,
  MAILBOX_SENDER_COLUMNS,
  type MailboxSender,
} from "@/lib/email/send";
import { decryptToken } from "@/lib/email/mailbox-crypto";
import { revokeMailboxAccess } from "@/lib/email/mailbox-oauth";
import { isMailboxProviderType } from "@/lib/email/mailbox-providers";

export type MailboxState = { ok?: boolean; error?: string };

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

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };

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
    .select(`email, display_name, ${MAILBOX_SENDER_COLUMNS}`)
    .eq("id", id)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!row) return { error: "That mailbox no longer exists." };

  const mailbox = row as MailboxSender & {
    email: string;
    display_name: string | null;
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

  // A successful send proves the connection: clear any stale warning so the
  // Reconnect prompt doesn't linger after the user has fixed things.
  if (isConnectedMailbox(mailbox)) {
    await supabase
      .from("mailboxes")
      .update({ connect_error: null })
      .eq("id", id)
      .eq("org_id", org.id);
  }

  revalidatePath("/settings/mailboxes");
  return { ok: true };
}
