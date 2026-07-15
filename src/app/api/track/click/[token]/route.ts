import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import { verifyToken } from "@/lib/email/tracking";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// Click-tracking redirect. The destination URL is carried inside the signed
// token (not a query param), so it can't be tampered into an open redirect.
// Records a `clicked` event, then 302s to the original URL.

// Defense-in-depth: even though the URL is signed, only ever redirect to an
// http(s) destination so a bad stored link (e.g. `javascript:`/`data:`) can't
// turn the trusted domain into an XSS/phishing vector.
function safeRedirectUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  const home = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { token } = await ctx.params;
  const t = verifyToken(token);
  const dest = t?.url ? safeRedirectUrl(t.url) : null;
  if (!t || !dest) {
    return NextResponse.redirect(home);
  }

  // Under a flood from one IP, still redirect the (human) clicker but skip the
  // recorded work (DB write + workflow fan-out).
  if (!rateLimit(`click:${clientIp(req)}`, 120, 60).allowed) {
    return NextResponse.redirect(dest);
  }

  const admin = createAdminClient();
  await admin.from("events").insert({
    org_id: t.orgId,
    type: "clicked",
    campaign_id: t.campaignId,
    campaign_step_id: t.stepId,
    contact_id: t.contactId,
    metadata: { url: t.url },
  });
  // Let `email_clicked`-triggered workflows enroll this contact.
  await inngest.send({
    name: "contact/email.clicked",
    data: {
      orgId: t.orgId,
      contactId: t.contactId,
      campaignId: t.campaignId,
    },
  });

  return NextResponse.redirect(dest);
}
