import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseUnsubToken } from "@/lib/unsubscribe";

function page(message: string, formToken?: string): NextResponse {
  // When a token is passed we render a one-click confirm button that POSTs —
  // the GET itself never mutates, so link scanners (SafeLinks, Gmail proxy)
  // prefetching the URL can't silently unsubscribe the recipient.
  const form = formToken
    ? `<form method="post" style="margin-top:1.5rem">
         <input type="hidden" name="token" value="${formToken}">
         <button type="submit" style="font:inherit;padding:.6rem 1.2rem;border:0;border-radius:8px;background:#18181b;color:#fff;cursor:pointer">Unsubscribe</button>
       </form>`
    : "";
  return new NextResponse(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head>
     <body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem;text-align:center">
       <h1 style="font-size:1.25rem">Handshake</h1><p>${message}</p>${form}</body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

/** Perform the actual unsubscribe. Idempotent. */
async function unsubscribe(token: string): Promise<boolean> {
  const parsed = parseUnsubToken(token);
  if (!parsed) return false;

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("contacts")
    .select("id, org_id, email")
    .eq("id", parsed.contactId)
    .single();
  if (!contact) return false;

  const now = new Date().toISOString();

  await admin
    .from("contacts")
    .update({ unsubscribed_at: now })
    .eq("id", contact.id);

  if (contact.email) {
    await admin.from("suppressions").upsert(
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

  await admin.from("events").insert({
    org_id: contact.org_id,
    type: "unsubscribed",
    contact_id: contact.id,
    campaign_id: parsed.campaignId,
  });

  return true;
}

// GET is safe (no mutation): show a one-click confirmation button. This keeps
// automated link scanners from unsubscribing recipients who never clicked.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token || !parseUnsubToken(token))
    return page("Invalid unsubscribe link.");
  return page(
    "Click below to stop receiving these emails.",
    token
  );
}

// POST performs the unsubscribe. Handles both the confirm-page form submission
// and RFC 8058 one-click (List-Unsubscribe-Post), where the mail client POSTs
// `List-Unsubscribe=One-Click` to the List-Unsubscribe URL (token in the query).
export async function POST(request: Request) {
  let token = new URL(request.url).searchParams.get("token") ?? undefined;
  if (!token) {
    try {
      const form = await request.formData();
      token = String(form.get("token") ?? "") || undefined;
    } catch {
      // no form body (e.g. one-click sends `List-Unsubscribe=One-Click`) —
      // fall through; the token is then expected on the query string.
    }
  }
  if (!token) return page("Invalid unsubscribe link.");

  const ok = await unsubscribe(token);
  return page(
    ok
      ? "You've been unsubscribed. You won't receive further emails."
      : "Invalid unsubscribe link."
  );
}
