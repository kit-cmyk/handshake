"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireContext } from "@/lib/context";
import { getEmailProvider, defaultFrom } from "@/lib/email/provider";
import { wrapEmail } from "@/lib/email/layout";

export type TeamState = { ok?: boolean; error?: string; message?: string };

const ROLES = ["admin", "member"];
const CAN_MANAGE = ["owner", "admin"];
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createInvite(
  _prev: TeamState,
  fd: FormData
): Promise<TeamState> {
  const { supabase, org } = await requireContext();

  // Only owners/admins may invite members — otherwise any member could invite
  // an accomplice as `admin` (the only path to an elevated role), escalating
  // privilege within the org.
  if (!CAN_MANAGE.includes(org.role))
    return { error: "Only workspace admins can invite members." };

  const email = String(fd.get("email") ?? "")
    .trim()
    .toLowerCase();
  const roleRaw = String(fd.get("role") ?? "member");
  const role = ROLES.includes(roleRaw) ? roleRaw : "member";
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };

  // Already a member?
  const { data: existingProfiles } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email);
  if (existingProfiles && existingProfiles.length) {
    const ids = existingProfiles.map((p) => (p as { id: string }).id);
    const { data: mem } = await supabase
      .from("memberships")
      .select("id")
      .eq("org_id", org.id)
      .in("user_id", ids)
      .maybeSingle();
    if (mem) return { error: "That person is already on your team." };
  }

  const token = randomUUID();
  const { error } = await supabase.from("invitations").insert({
    org_id: org.id,
    email,
    role,
    token,
  });
  if (error) return { error: error.message };

  // Best-effort invite email (mock sender in dev).
  const link = `${SITE}/invite/${token}`;
  const html = wrapEmail(
    `<h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#18181b">You&rsquo;re invited to ${org.name}</h1>
<p style="margin:0 0 20px">You&rsquo;ve been invited to join <strong>${org.name}</strong> on Handshake.</p>
<p style="margin:0 0 24px">
<a href="${link}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:500;padding:10px 20px;border-radius:8px">Accept the invitation</a>
</p>
<p style="margin:0;font-size:13px;color:#71717a">Or paste this link into your browser:<br /><a href="${link}" style="color:#71717a">${link}</a></p>`,
    { preheader: `Join ${org.name} on Handshake` }
  );
  await getEmailProvider().send({
    from: defaultFrom(),
    to: email,
    subject: `You're invited to join ${org.name} on Handshake`,
    html,
  });

  revalidatePath("/settings/team");
  return { ok: true, message: `Invitation sent to ${email}.` };
}

export async function revokeInvite(id: string): Promise<TeamState> {
  const { supabase, org } = await requireContext();
  if (!CAN_MANAGE.includes(org.role))
    return { error: "Only workspace admins can revoke invitations." };
  const { error } = await supabase
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings/team");
  return { ok: true };
}
