import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseUnsubToken } from "@/lib/unsubscribe";
import { rateLimit, clientIp } from "@/lib/rate-limit";

function page(message: string): NextResponse {
  return new NextResponse(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head>
     <body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem;text-align:center">
       <h1 style="font-size:1.25rem">Handshake</h1><p>${message}</p></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

export async function GET(request: Request) {
  const { allowed, retryAfter } = rateLimit(`unsub:${clientIp(request)}`, 30, 60);
  if (!allowed) {
    return new NextResponse("Too many requests. Please try again shortly.", {
      status: 429,
      headers: { "retry-after": String(retryAfter) },
    });
  }

  const token = new URL(request.url).searchParams.get("token");
  const parsed = token ? parseUnsubToken(token) : null;
  if (!parsed) return page("Invalid unsubscribe link.");

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("contacts")
    .select("id, org_id, email")
    .eq("id", parsed.contactId)
    .single();
  if (!contact) return page("This contact no longer exists.");

  const now = new Date().toISOString();

  await admin
    .from("contacts")
    .update({ unsubscribed_at: now })
    .eq("id", contact.id);

  if (contact.email) {
    await admin
      .from("suppressions")
      .upsert(
        {
          org_id: contact.org_id,
          email: contact.email,
          reason: "unsubscribe",
          contact_id: contact.id,
        },
        { onConflict: "org_id,email" }
      );
  }

  // Stop all in-flight sequences for this contact.
  await admin
    .from("campaign_enrollments")
    .update({ status: "unsubscribed" })
    .eq("contact_id", contact.id)
    .eq("status", "active");

  // Stop any in-flight workflow runs so no further steps (emails) fire.
  await admin
    .from("workflow_runs")
    .update({ status: "stopped", ended_at: now })
    .eq("contact_id", contact.id)
    .eq("status", "active");

  // Only attribute the unsubscribe to a campaign that actually belongs to this
  // contact's org — never trust the token's campaign id to reference a foreign org.
  let campaignId: string | null = null;
  if (parsed.campaignId) {
    const { data: campaign } = await admin
      .from("campaigns")
      .select("id")
      .eq("id", parsed.campaignId)
      .eq("org_id", contact.org_id)
      .maybeSingle();
    campaignId = campaign ? parsed.campaignId : null;
  }

  await admin.from("events").insert({
    org_id: contact.org_id,
    type: "unsubscribed",
    contact_id: contact.id,
    campaign_id: campaignId,
  });

  return page("You've been unsubscribed. You won't receive further emails.");
}
