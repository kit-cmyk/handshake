import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSecret } from "@/lib/email/webhook-auth";
import { shouldStopOnReply } from "@/lib/campaigns/reply";
import { notifyReplyReceived } from "@/lib/integrations/notify";
import { inngest } from "@/lib/inngest/client";

// Generic email-provider webhook. Maps a delivery event back to the original
// `sent` event via message_id, then records opens/clicks/replies/bounces and
// updates enrollment status. Real providers should be signature-verified here.

type WebhookBody = {
  message_id?: string;
  type?: "delivered" | "opened" | "clicked" | "replied" | "bounced";
  url?: string;
};

const ALLOWED = new Set([
  "delivered",
  "opened",
  "clicked",
  "replied",
  "bounced",
]);

export async function POST(request: Request) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = (await request.json()) as WebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { message_id, type } = body;
  if (!message_id || !type || !ALLOWED.has(type)) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Find the originating send to resolve org / campaign / workflow / contact.
  const { data: sent } = await admin
    .from("events")
    .select(
      "org_id, campaign_id, campaign_step_id, contact_id, workflow_id, workflow_node_id"
    )
    .eq("type", "sent")
    .filter("metadata->>message_id", "eq", message_id)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sent) {
    // Unknown message — acknowledge so the provider doesn't retry forever.
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Idempotency for terminal events: providers retry webhooks, and re-processing
  // a reply/bounce would re-fire Slack notifications, re-enqueue the
  // `contact/replied` workflow trigger, and duplicate the event row. If we've
  // already recorded this outcome for this message, acknowledge and stop.
  // (opened/clicked/delivered are safe to record repeatedly — the funnel dedups
  // by contact.)
  if (type === "replied" || type === "bounced") {
    const { data: prior } = await admin
      .from("events")
      .select("id")
      .eq("type", type)
      .filter("metadata->>message_id", "eq", message_id)
      .limit(1)
      .maybeSingle();
    if (prior) return NextResponse.json({ ok: true, duplicate: true });
  }

  await admin.from("events").insert({
    org_id: sent.org_id,
    type,
    campaign_id: sent.campaign_id,
    campaign_step_id: sent.campaign_step_id,
    workflow_id: sent.workflow_id,
    workflow_node_id: sent.workflow_node_id,
    contact_id: sent.contact_id,
    metadata: { message_id, url: body.url ?? null },
  });

  // Terminal outcomes update the enrollment (and suppress on bounce).
  if (type === "bounced") {
    if (sent.campaign_id && sent.contact_id) {
      await admin
        .from("campaign_enrollments")
        .update({ status: "bounced" })
        .eq("campaign_id", sent.campaign_id)
        .eq("contact_id", sent.contact_id);
    }
    if (sent.contact_id) {
      const { data: contact } = await admin
        .from("contacts")
        .select("email")
        .eq("id", sent.contact_id)
        .single();
      if (contact?.email) {
        await admin.from("suppressions").upsert(
          {
            org_id: sent.org_id,
            email: contact.email,
            reason: "bounce",
            contact_id: sent.contact_id,
          },
          { onConflict: "org_id,email" }
        );
      }
      // A hard bounce should halt any in-flight workflow runs too.
      await admin
        .from("workflow_runs")
        .update({ status: "stopped", ended_at: new Date().toISOString() })
        .eq("contact_id", sent.contact_id)
        .eq("status", "active");
    }
  } else if (type === "replied") {
    // Honor the per-step override, falling back to the campaign default.
    if (
      sent.campaign_id &&
      sent.contact_id &&
      (await shouldStopOnReply(admin, sent.campaign_id, sent.campaign_step_id))
    ) {
      await admin
        .from("campaign_enrollments")
        .update({ status: "replied" })
        .eq("campaign_id", sent.campaign_id)
        .eq("contact_id", sent.contact_id)
        .eq("status", "active");
    }
  }

  // A reply drives workflow reply-triggers and exit-on-reply. Handled durably
  // in Inngest so a slow webhook never blocks the provider.
  if (type === "replied" && sent.contact_id) {
    await notifyReplyReceived(
      admin,
      sent.org_id,
      sent.contact_id,
      sent.campaign_id,
    );

    await inngest.send({
      name: "contact/replied",
      data: {
        orgId: sent.org_id,
        contactId: sent.contact_id,
        campaignId: sent.campaign_id ?? null,
        workflowId: sent.workflow_id ?? null,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
