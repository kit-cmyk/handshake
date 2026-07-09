"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";
import {
  isSlackEventKey,
  isValidSlackWebhookUrl,
  postToSlack,
  type SlackConfig,
  type SlackEventKey,
} from "@/lib/integrations/slack";

export type SlackState = { ok?: boolean; error?: string; message?: string };

const CAN_MANAGE = ["owner", "admin"];

function parseEvents(fd: FormData): SlackEventKey[] {
  return fd
    .getAll("events")
    .map(String)
    .filter(isSlackEventKey);
}

/** Create or update the org's Slack integration from the settings form. */
export async function saveSlackIntegration(
  _prev: SlackState,
  fd: FormData,
): Promise<SlackState> {
  const { supabase, org } = await requireContext();
  if (!CAN_MANAGE.includes(org.role))
    return { error: "Only workspace admins can change integrations." };

  const webhookUrl = String(fd.get("webhook_url") ?? "").trim();
  if (!webhookUrl) return { error: "A Slack Incoming Webhook URL is required." };
  if (!isValidSlackWebhookUrl(webhookUrl))
    return {
      error:
        "That doesn't look like a Slack Incoming Webhook URL (https://hooks.slack.com/services/…).",
    };

  const events = parseEvents(fd);
  if (events.length === 0)
    return { error: "Choose at least one event to be notified about." };

  const enabled = fd.get("enabled") !== "false";
  const config: SlackConfig = { webhook_url: webhookUrl, events };

  const { error } = await supabase.from("org_integrations").upsert(
    { org_id: org.id, type: "slack", config, enabled },
    { onConflict: "org_id,type" },
  );
  if (error) return { error: error.message };

  revalidatePath("/settings/integrations");
  return { ok: true, message: "Slack notifications saved." };
}

/** Post a sample message so the user can confirm the webhook works. */
export async function testSlackIntegration(): Promise<SlackState> {
  const { supabase, org } = await requireContext();
  if (!CAN_MANAGE.includes(org.role))
    return { error: "Only workspace admins can test integrations." };

  const { data } = await supabase
    .from("org_integrations")
    .select("config")
    .eq("org_id", org.id)
    .eq("type", "slack")
    .maybeSingle();

  const url = (data?.config as Partial<SlackConfig> | null)?.webhook_url;
  if (!url) return { error: "Connect Slack first, then send a test." };

  const res = await postToSlack(
    url,
    `:wave: Handshake is connected to *${org.name}*. Notifications will appear here.`,
  );
  return res.ok
    ? { ok: true, message: "Test message sent — check your Slack channel." }
    : { error: res.error ?? "Could not reach Slack." };
}

/** Remove the org's Slack integration entirely. */
export async function disconnectSlackIntegration(): Promise<SlackState> {
  const { supabase, org } = await requireContext();
  if (!CAN_MANAGE.includes(org.role))
    return { error: "Only workspace admins can change integrations." };

  const { error } = await supabase
    .from("org_integrations")
    .delete()
    .eq("org_id", org.id)
    .eq("type", "slack");
  if (error) return { error: error.message };

  revalidatePath("/settings/integrations");
  return { ok: true, message: "Slack disconnected." };
}
