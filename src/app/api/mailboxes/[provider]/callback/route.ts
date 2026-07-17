import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { isMailboxProviderType } from "@/lib/email/mailbox-providers";
import {
  exchangeCode,
  fetchAccountEmail,
  mailboxOAuthClient,
} from "@/lib/email/mailbox-oauth";
import { encryptToken } from "@/lib/email/mailbox-crypto";
import { mailboxRedirectUri } from "@/lib/email/mailbox-redirect";

// OAuth redirect target. Verifies the CSRF state cookie, exchanges the code for
// tokens, resolves the authenticated account address, encrypts + stores the
// tokens on a mailbox row, and returns the user to mailbox settings. Errors
// round-trip as `?mailbox_error=…`.

const CAN_MANAGE = ["owner", "admin"];

export async function GET(
  request: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { origin, searchParams } = new URL(request.url);
  const { provider } = await ctx.params;
  const settings = `${origin}/settings/mailboxes`;
  const fail = (reason: string) =>
    NextResponse.redirect(`${settings}?mailbox_error=${reason}`);

  if (!isMailboxProviderType(provider)) return fail("unknown");
  if (searchParams.get("error")) return fail("denied");

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieStore = await cookies();
  const cookieName = `mailbox_oauth_${provider}`;
  const expected = cookieStore.get(cookieName)?.value;
  if (!code || !state || !expected || state !== expected) return fail("state");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const org = await getActiveOrg();
  if (!org) return NextResponse.redirect(`${origin}/onboarding`);
  if (!CAN_MANAGE.includes(org.role)) return fail("forbidden");

  const client = mailboxOAuthClient(provider);
  if (!client) return fail("not_configured");

  try {
    const tokens = await exchangeCode({
      type: provider,
      code,
      redirectUri: mailboxRedirectUri(request, provider),
      client,
    });
    const email = await fetchAccountEmail(provider, tokens.accessToken);

    const row = {
      provider,
      oauth_email: email,
      email,
      access_token: encryptToken(tokens.accessToken),
      refresh_token: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
      token_expires_at: tokens.expiresInSec
        ? new Date(Date.now() + tokens.expiresInSec * 1000).toISOString()
        : null,
      status: "active" as const,
      connect_error: null,
    };

    // Re-connecting the same account updates its tokens in place; a new account
    // is inserted. (Keyed on org_id + oauth_email — see the migration's index.)
    const { data: existing } = await supabase
      .from("mailboxes")
      .select("id, display_name")
      .eq("org_id", org.id)
      .eq("oauth_email", email)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("mailboxes")
        .update(row)
        .eq("id", (existing as { id: string }).id);
      if (error) return fail("save");
    } else {
      const { error } = await supabase.from("mailboxes").insert({
        org_id: org.id,
        user_id: user.id,
        display_name: email.split("@")[0],
        ...row,
      });
      if (error) return fail("save");
    }
  } catch {
    return fail("exchange");
  }

  const res = NextResponse.redirect(`${settings}?mailbox_connected=${provider}`);
  res.cookies.set(cookieName, "", { path: "/", maxAge: 0 });
  return res;
}
