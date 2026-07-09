import type { SupabaseClient } from "@supabase/supabase-js";

// Slack notifications. A user pastes an Incoming Webhook URL in Settings →
// Integrations and picks which events should post to their channel. Dispatch is
// best-effort: it never throws and never blocks the caller's critical path — a
// missed notification must not fail a reply ingest, a deal update, or a send.

/** Notification events a workspace can subscribe to. */
export const SLACK_EVENTS = [
  {
    key: "reply",
    label: "Lead replies",
    description: "A prospect replies to a campaign or workflow email.",
  },
  {
    key: "deal_won",
    label: "Deal won",
    description: "A deal moves into a won stage.",
  },
  {
    key: "campaign_finished",
    label: "Campaign finished",
    description: "A contact completes every step of a campaign sequence.",
  },
] as const;

export type SlackEventKey = (typeof SLACK_EVENTS)[number]["key"];

export const SLACK_EVENT_KEYS = SLACK_EVENTS.map((e) => e.key);

export function isSlackEventKey(v: unknown): v is SlackEventKey {
  return typeof v === "string" && SLACK_EVENT_KEYS.includes(v as SlackEventKey);
}

export type SlackConfig = {
  webhook_url: string;
  events: SlackEventKey[];
};

/** Slack Incoming Webhook URLs look like https://hooks.slack.com/services/… */
export function isValidSlackWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname === "hooks.slack.com" &&
      u.pathname.startsWith("/services/")
    );
  } catch {
    return false;
  }
}

/** POST a plain-text message to a Slack Incoming Webhook. Returns ok/error. */
export async function postToSlack(
  webhookUrl: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isValidSlackWebhookUrl(webhookUrl)) {
    return { ok: false, error: "Not a valid Slack Incoming Webhook URL." };
  }
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Slack responded ${res.status} ${body}`.trim() };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Request failed" };
  }
}

/**
 * Dispatch a notification for `orgId` if that org has an enabled Slack
 * integration subscribed to `event`. Best-effort — swallows all errors.
 * `client` may be an org-scoped (RLS) or service-role client.
 */
export async function notifySlack(
  client: SupabaseClient,
  orgId: string,
  event: SlackEventKey,
  text: string,
): Promise<void> {
  try {
    const { data } = await client
      .from("org_integrations")
      .select("config, enabled")
      .eq("org_id", orgId)
      .eq("type", "slack")
      .maybeSingle();

    if (!data || !data.enabled) return;

    const config = data.config as Partial<SlackConfig> | null;
    const url = config?.webhook_url;
    const events = config?.events ?? [];
    if (!url || !events.includes(event)) return;

    await postToSlack(url, text);
  } catch {
    // Notifications are non-critical — never surface to the caller.
  }
}
