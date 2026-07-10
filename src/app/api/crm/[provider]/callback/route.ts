import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { isCrmProviderType } from "@/lib/crm/providers";
import { buildOAuthConfig, oauthClient } from "@/lib/crm/connection";
import { exchangeCode } from "@/lib/crm/oauth";
import { crmRedirectUri } from "@/lib/crm/redirect";

// OAuth redirect target. Verifies the CSRF state cookie, exchanges the code for
// tokens, encrypts + stores them on the org's integration row, and returns the
// user to the integrations settings page. Errors round-trip as `?crm_error=…`.

const CAN_MANAGE = ["owner", "admin"];

export async function GET(
  request: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { origin, searchParams } = new URL(request.url);
  const { provider } = await ctx.params;
  const settings = `${origin}/settings/integrations`;
  const fail = (reason: string) =>
    NextResponse.redirect(`${settings}?crm_error=${reason}`);

  if (!isCrmProviderType(provider)) return fail("unknown");
  if (searchParams.get("error")) return fail("denied");

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieStore = await cookies();
  const cookieName = `crm_oauth_${provider}`;
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

  const client = oauthClient(provider);
  if (!client) return fail("not_configured");

  try {
    const tokens = await exchangeCode({
      type: provider,
      code,
      redirectUri: crmRedirectUri(request, provider),
      client,
    });
    // QuickBooks returns the company id as `realmId` on the callback; other
    // providers ignore it.
    const realmId = searchParams.get("realmId") ?? undefined;
    const config = buildOAuthConfig(tokens, { realmId }, Date.now());

    const { error } = await supabase.from("org_integrations").upsert(
      { org_id: org.id, type: provider, config, enabled: true },
      { onConflict: "org_id,type" },
    );
    if (error) return fail("save");
  } catch {
    return fail("exchange");
  }

  const res = NextResponse.redirect(`${settings}?crm_connected=${provider}`);
  res.cookies.set(cookieName, "", { path: "/", maxAge: 0 });
  return res;
}
