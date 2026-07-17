import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { isMailboxProviderType } from "@/lib/email/mailbox-providers";
import { authorizeUrl, mailboxOAuthClient } from "@/lib/email/mailbox-oauth";
import { mailboxRedirectUri } from "@/lib/email/mailbox-redirect";

// Start of the mailbox OAuth flow. The "Connect Gmail/Outlook" links point here;
// we set a short-lived, httpOnly CSRF state cookie and 302 to the provider's
// consent page. The provider redirects back to /api/mailboxes/<provider>/callback.

const CAN_MANAGE = ["owner", "admin"];

export async function GET(
  request: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { origin } = new URL(request.url);
  const { provider } = await ctx.params;
  const settings = `${origin}/settings/mailboxes`;

  if (!isMailboxProviderType(provider))
    return NextResponse.redirect(`${settings}?mailbox_error=unknown`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const org = await getActiveOrg();
  if (!org) return NextResponse.redirect(`${origin}/onboarding`);
  if (!CAN_MANAGE.includes(org.role))
    return NextResponse.redirect(`${settings}?mailbox_error=forbidden`);

  const client = mailboxOAuthClient(provider);
  if (!client)
    return NextResponse.redirect(`${settings}?mailbox_error=not_configured`);

  const state = crypto.randomBytes(16).toString("hex");
  const url = authorizeUrl({
    type: provider,
    client,
    redirectUri: mailboxRedirectUri(request, provider),
    state,
  });

  const res = NextResponse.redirect(url);
  res.cookies.set(`mailbox_oauth_${provider}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes to complete the flow
  });
  return res;
}
