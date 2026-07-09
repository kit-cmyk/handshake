import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import { verifyToken, PIXEL_GIF } from "@/lib/email/tracking";

// Open-tracking pixel. Records an `opened` event, then always returns the 1x1
// GIF (even for bad tokens) so email clients never render a broken image.
// Funnel reports dedup by contact, so repeated loads don't inflate open counts.

function pixel(): Response {
  // Cast to satisfy BodyInit typing across runtimes.
  return new Response(new Uint8Array(PIXEL_GIF), {
    status: 200,
    headers: {
      "content-type": "image/gif",
      "cache-control": "no-store, no-cache, must-revalidate, private",
      "content-length": String(PIXEL_GIF.length),
    },
  });
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;
  const t = verifyToken(token);
  if (t) {
    const admin = createAdminClient();
    await admin.from("events").insert({
      org_id: t.orgId,
      type: "opened",
      campaign_id: t.campaignId,
      campaign_step_id: t.stepId,
      contact_id: t.contactId,
    });
    // Let `email_opened`-triggered workflows enroll this contact.
    await inngest.send({
      name: "contact/email.opened",
      data: {
        orgId: t.orgId,
        contactId: t.contactId,
        campaignId: t.campaignId,
      },
    });
  }
  return pixel();
}
