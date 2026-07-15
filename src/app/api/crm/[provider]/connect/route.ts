import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { isCrmProviderType } from "@/lib/crm/providers";
import { oauthClient } from "@/lib/crm/connection";
import { authorizeUrl } from "@/lib/crm/oauth";
import { crmRedirectUri } from "@/lib/crm/redirect";

// Start of the CRM OAuth flow. The "Connect" button links here; we set a
// short-lived, httpOnly CSRF state cookie and 302 to the provider's authorize
// page. The provider redirects back to /api/crm/<provider>/callback.

const CAN_MANAGE = ["owner", "admin"];

export async function GET(
  request: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { origin } = new URL(request.url);
  const { provider } = await ctx.params;
  const settings = `${origin}/settings/integrations`;

  if (!isCrmProviderType(provider))
    return NextResponse.redirect(`${settings}?crm_error=unknown`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const org = await getActiveOrg();
  if (!org) return NextResponse.redirect(`${origin}/onboarding`);
  if (!CAN_MANAGE.includes(org.role))
    return NextResponse.redirect(`${settings}?crm_error=forbidden`);

  const client = oauthClient(provider);
  if (!client)
    return NextResponse.redirect(`${settings}?crm_error=not_configured`);

  const state = crypto.randomBytes(16).toString("hex");
  const url = authorizeUrl({
    type: provider,
    client,
    redirectUri: crmRedirectUri(request, provider),
    state,
  });

  const res = NextResponse.redirect(url);
  res.cookies.set(`crm_oauth_${provider}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes to complete the flow
  });
  return res;
}
