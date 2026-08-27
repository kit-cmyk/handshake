import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSecret } from "@/lib/email/webhook-auth";
import { tokenFromReplyAddress, verifyReplyToken } from "@/lib/email/tracking";
import { shouldStopOnReply } from "@/lib/campaigns/reply";
import { notifyReplyReceived } from "@/lib/integrations/notify";
import { buildInboundMessage } from "@/lib/inbox/inbound";
import { classifyInbound } from "@/lib/email/inbound-classify";
import { parseReferences } from "@/lib/inbox/threading";
import { inngest } from "@/lib/inngest/client";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// Inbound-reply webhook. A mail provider (inbound parse) or IMAP poller posts
// the reply here. We identify the enrollment from the signed token in the
// recipient address (`reply+<token>@domain`), record a `replied` event, and —
// when the campaign is set to stop on reply — mark the enrollment `replied` so
// the durable engine halts the sequence before its next send.
//
// Not everything arriving at a reply address is a reply: out-of-office
// auto-responders and delivery failure reports (DSNs) arrive there too. Each is
// classified first — a bounce suppresses the address and marks the enrollment
// `bounced`, an auto-reply is captured for the user to read but never stops the
// sequence or claims someone replied.
//
// When the provider forwards the parsed body (from/subject/text/html), we also
// capture the message into the inbox: resolve the thread — by the reply's
// In-Reply-To / References chain when present, else the contact's email thread —
// and insert an inbound message. This works both for token-routed campaign
// replies and for "cold" inbound matched by sender email → contact.

type InboundBody = {
  to?: string; // full recipient address, e.g. "reply+<token>@reply.example.com"
  token?: string; // or the raw token directly
  from?: string; // sender, e.g. "Jane <jane@acme.com>"
  subject?: string;
  text?: string;
  html?: string;
  cc?: string; // raw Cc header, e.g. "Ada <ada@x.com>, bob@y.com"
  message_id?: string;
  // Signals used to tell a human reply from an auto-responder or a delivery
  // failure report — see @/lib/email/inbound-classify. Providers differ in
  // whether they forward a full header map or a few named fields, so both
  // shapes are accepted and either may be absent.
  headers?: Record<string, string>;
  auto_submitted?: string;
  content_type?: string;
  in_reply_to?: string; // the Message-ID this reply answers
  references?: string; // the full References chain, oldest first
};

/** Extract the bare email address from a "Name <email>" header value. */
function extractEmail(value: string | undefined | null): string | null {
  if (!value) return null;
  const m = /<([^>]+)>/.exec(value);
  const email = (m ? m[1] : value).trim().toLowerCase();
  return email.includes("@") ? email : null;
}

/** Escape LIKE wildcards so `ilike` is a case-insensitive *exact* match. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Whether an event of this type was already recorded for this inbound message.
 * A provider retry would otherwise re-suppress an address or duplicate the
 * event. Skipped when the provider forwarded no Message-ID, since there is then
 * nothing stable to deduplicate on.
 */
async function alreadyRecorded(
  admin: SupabaseClient,
  orgId: string,
  type: string,
  messageId: string | null,
): Promise<boolean> {
  if (!messageId) return false;
  const { data } = await admin
    .from("events")
    .select("id")
    .eq("org_id", orgId)
    .eq("type", type)
    .filter("metadata->>message_id", "eq", messageId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * Record a delivery failure: the event, the terminal enrollment state, the
 * suppression that stops us mailing a dead address again, and halting any
 * in-flight workflow runs for the contact. Mirrors the bounce branch of
 * /api/webhooks/email so both entry points converge on the same end state.
 */
async function recordBounce(
  admin: SupabaseClient,
  reply: {
    orgId: string;
    campaignId: string | null;
    stepId: string | null;
    contactId: string;
    enrollmentId: string;
  },
  messageId: string | null,
): Promise<void> {
  await admin.from("events").insert({
    org_id: reply.orgId,
    type: "bounced",
    campaign_id: reply.campaignId,
    campaign_step_id: reply.stepId,
    contact_id: reply.contactId,
    metadata: { message_id: messageId },
  });

  await admin
    .from("campaign_enrollments")
    .update({ status: "bounced" })
    .eq("id", reply.enrollmentId);

  const { data: contact } = await admin
    .from("contacts")
    .select("email")
    .eq("id", reply.contactId)
    .maybeSingle();
  const email = (contact as { email: string | null } | null)?.email;
  if (email) {
    await admin.from("suppressions").upsert(
      {
        org_id: reply.orgId,
        email,
        reason: "bounce",
        contact_id: reply.contactId,
      },
      { onConflict: "org_id,email" },
    );
  }

  // A dead address should halt the contact's workflow runs too, not just this
  // campaign — they would go on emailing the same address.
  await admin
    .from("workflow_runs")
    .update({ status: "stopped", ended_at: new Date().toISOString() })
    .eq("contact_id", reply.contactId)
    .eq("status", "active");
 * Resolve which thread a reply belongs to from its In-Reply-To / References
 * chain: any id in the chain that we sent identifies the thread exactly, even
 * if the contact has since been merged or the reply came from an alias. Returns
 * null when the headers are missing or unknown, and the caller falls back to
 * the contact's own thread.
 */
async function threadFromHeaders(
  admin: SupabaseClient,
  orgId: string,
  body: InboundBody,
): Promise<string | null> {
  const chain = [
    ...parseReferences(body.in_reply_to),
    ...parseReferences(body.references),
  ];
  if (!chain.length) return null;
  const { data } = await admin
    .from("messages")
    .select("conversation_id")
    .eq("org_id", orgId)
    .in("message_id", chain)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { conversation_id: string } | null)?.conversation_id ?? null;
}

/** Capture the parsed email into the inbox (best-effort; never throws). */
async function captureMessage(
  admin: SupabaseClient,
  ctx: { orgId: string; contactId: string; campaignId: string | null },
  body: InboundBody,
): Promise<void> {
  // Only capture when the provider actually forwarded content.
  const hasContent = !!(body.from || body.subject || body.text || body.html);
  if (!hasContent) return;

  // Prefer the thread the reply's headers point at; otherwise the contact's own
  // email thread, created on first contact. Either way the thread's subject is
  // its identity — an inbound "Re: …" never renames it.
  let conversationId = await threadFromHeaders(admin, ctx.orgId, body);
  if (!conversationId) {
    const { data: existing } = await admin
      .from("conversations")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("contact_id", ctx.contactId)
      .eq("channel", "email")
      .maybeSingle();

    if (existing) {
      conversationId = (existing as { id: string }).id;
    } else {
      const { data: contact } = await admin
        .from("contacts")
        .select("company_id")
        .eq("id", ctx.contactId)
        .maybeSingle();

      const { data: conv } = await admin
        .from("conversations")
        .insert({
          org_id: ctx.orgId,
          contact_id: ctx.contactId,
          company_id:
            (contact as { company_id: string | null } | null)?.company_id ?? null,
          channel: "email",
          subject: body.subject ?? null,
        })
        .select("id")
        .maybeSingle();
      if (!conv) return;
      conversationId = (conv as { id: string }).id;
    }
  }

  const message = buildInboundMessage(
    {
      from: body.from,
      to: body.to,
      subject: body.subject,
      text: body.text,
      html: body.html,
      cc: body.cc,
      messageId: body.message_id,
      inReplyTo: body.in_reply_to,
    },
    { orgId: ctx.orgId, contactId: ctx.contactId, campaignId: ctx.campaignId },
  );
  await admin
    .from("messages")
    .insert({ ...message, conversation_id: conversationId });
}

export async function POST(request: Request) {
  const { allowed, retryAfter } = rateLimit(`wh-inbound:${clientIp(request)}`, 600, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "retry-after": String(retryAfter) } }
    );
  }
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: InboundBody;
  try {
    body = (await request.json()) as InboundBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const admin = createAdminClient();

  const raw = body.token ?? (body.to ? tokenFromReplyAddress(body.to) : null);
  const reply = raw ? verifyReplyToken(raw) : null;

  if (reply) {
    const kind = classifyInbound(body);
    const messageId = body.message_id ?? null;

    // A delivery failure report. Not a reply — suppress the address so no
    // campaign or workflow mails it again.
    if (kind === "bounce") {
      if (await alreadyRecorded(admin, reply.orgId, "bounced", messageId)) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      await recordBounce(admin, reply, messageId);
      // Deliberately not captured into the inbox: a machine-generated failure
      // notice in the contact's thread reads as a message from them.
      return NextResponse.json({ ok: true, kind });
    }

    // An auto-responder. Worth reading, so it lands in the inbox thread, but it
    // must not halt the sequence, notify anyone, or drive reply workflows —
    // nobody has actually read the email yet.
    if (kind === "auto_reply") {
      if (await alreadyRecorded(admin, reply.orgId, "auto_reply", messageId)) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      await admin.from("events").insert({
        org_id: reply.orgId,
        type: "auto_reply",
        campaign_id: reply.campaignId,
        campaign_step_id: reply.stepId,
        contact_id: reply.contactId,
        metadata: { message_id: messageId },
      });
      await captureMessage(
        admin,
        {
          orgId: reply.orgId,
          contactId: reply.contactId,
          campaignId: reply.campaignId ?? null,
        },
        body,
      );
      return NextResponse.json({ ok: true, kind });
    }

    // A genuine reply — existing behavior, unchanged.
    await admin.from("events").insert({
      org_id: reply.orgId,
      type: "replied",
      campaign_id: reply.campaignId,
      campaign_step_id: reply.stepId,
      contact_id: reply.contactId,
    });

    if (await shouldStopOnReply(admin, reply.campaignId, reply.stepId)) {
      await admin
        .from("campaign_enrollments")
        .update({ status: "replied" })
        .eq("id", reply.enrollmentId)
        .eq("status", "active");
    }

    // Notify Slack if the org has opted in (best-effort, no-op otherwise).
    await notifyReplyReceived(admin, reply.orgId, reply.contactId, reply.campaignId);

    // Drive workflow reply-triggers / exit-on-reply for this contact.
    await inngest.send({
      name: "contact/replied",
      data: {
        orgId: reply.orgId,
        contactId: reply.contactId,
        campaignId: reply.campaignId ?? null,
        workflowId: null,
      },
    });

    // Capture the reply body into the inbox.
    await captureMessage(
      admin,
      {
        orgId: reply.orgId,
        contactId: reply.contactId,
        campaignId: reply.campaignId ?? null,
      },
      body,
    );

    return NextResponse.json({ ok: true });
  }

  // No token — try to match a "cold" inbound to a contact by sender email.
  // Use an escaped ilike (exact, case-insensitive — no `_`/`%` wildcard match).
  //
  // Delivery failure reports are dropped here rather than filed: with no token
  // there's no enrollment to mark bounced, and the DSN's sender is
  // mailer-daemon, so any contact match would be wrong anyway.
  if (classifyInbound(body) === "bounce") {
    return NextResponse.json({ ok: true, ignored: true, kind: "bounce" });
  }

  const senderEmail = extractEmail(body.from);
  if (senderEmail && (body.subject || body.text || body.html)) {
    const { data: matches } = await admin
      .from("contacts")
      .select("id, org_id")
      .ilike("email", escapeLike(senderEmail));
    const rows = (matches ?? []) as { id: string; org_id: string }[];
    const orgs = new Set(rows.map((r) => r.org_id));
    // If the address belongs to contacts in more than one org there's no token
    // to disambiguate — refuse rather than leak the message into a random org.
    if (rows.length && orgs.size === 1) {
      await captureMessage(
        admin,
        { orgId: rows[0].org_id, contactId: rows[0].id, campaignId: null },
        body,
      );
      return NextResponse.json({ ok: true });
    }
  }

  // Unknown/forged address and no matching contact — acknowledge so the
  // provider stops retrying.
  return NextResponse.json({ ok: true, ignored: true });
}
