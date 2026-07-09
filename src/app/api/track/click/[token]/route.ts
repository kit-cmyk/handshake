import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import { verifyToken } from "@/lib/email/tracking";

// Click-tracking redirect. The destination URL is carried inside the signed
// token (not a query param), so it can't be tampered into an open redirect.
// Records a `clicked` event, then 302s to the original URL.

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;
  const t = verifyToken(token);
  if (!t || !t.url) {
    return NextResponse.redirect(
      process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
    );
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

  return NextResponse.redirect(t.url);
}
