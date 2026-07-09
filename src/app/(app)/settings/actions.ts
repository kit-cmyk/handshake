"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";
import { getEmailProvider } from "@/lib/email/provider";

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
  const { supabase } = await requireContext();
  const { error } = await supabase.from("mailboxes").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings/mailboxes");
  return { ok: true };
}
