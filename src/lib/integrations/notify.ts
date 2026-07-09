import type { SupabaseClient } from "@supabase/supabase-js";
import { notifySlack } from "./slack";

// Message builders for the Slack integration. Each reads just enough context to
// write a human-readable line, then delegates to notifySlack (which no-ops when
// the org has no enabled Slack integration subscribed to the event). All are
// best-effort — notifySlack swallows errors — but callers should still not await
// them on a latency-critical path unless a miss is acceptable.

async function contactLabel(
  client: SupabaseClient,
  contactId: string | null | undefined,
): Promise<string> {
  if (!contactId) return "A lead";
  const { data } = await client
    .from("contacts")
    .select("first_name, last_name, email")
    .eq("id", contactId)
    .maybeSingle();
  if (!data) return "A lead";
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ").trim();
  return name || data.email || "A lead";
}

async function campaignName(
  client: SupabaseClient,
  campaignId: string | null | undefined,
): Promise<string | null> {
  if (!campaignId) return null;
  const { data } = await client
    .from("campaigns")
    .select("name")
    .eq("id", campaignId)
    .maybeSingle();
  return data?.name ?? null;
}

export async function notifyReplyReceived(
  client: SupabaseClient,
  orgId: string,
  contactId: string | null,
  campaignId: string | null,
): Promise<void> {
  const [who, campaign] = await Promise.all([
    contactLabel(client, contactId),
    campaignName(client, campaignId),
  ]);
  const suffix = campaign ? ` to *${campaign}*` : "";
  await notifySlack(client, orgId, "reply", `:email: ${who} replied${suffix}.`);
}

export async function notifyDealWon(
  client: SupabaseClient,
  orgId: string,
  title: string,
  value: number | null,
): Promise<void> {
  const amount =
    value != null && Number.isFinite(value)
      ? ` (${value.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        })})`
      : "";
  await notifySlack(
    client,
    orgId,
    "deal_won",
    `:tada: Deal won: *${title}*${amount}.`,
  );
}

export async function notifyCampaignFinished(
  client: SupabaseClient,
  orgId: string,
  contactId: string | null,
  campaignId: string | null,
): Promise<void> {
  const [who, campaign] = await Promise.all([
    contactLabel(client, contactId),
    campaignName(client, campaignId),
  ]);
  const suffix = campaign ? ` *${campaign}*` : " a campaign";
  await notifySlack(
    client,
    orgId,
    "campaign_finished",
    `:checkered_flag: ${who} finished${suffix}.`,
  );
}
