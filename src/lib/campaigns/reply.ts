import type { SupabaseClient } from "@supabase/supabase-js";

// Resolves whether a reply should halt the sequence. The step-level override
// wins when set; otherwise we fall back to the campaign-level default. Used by
// both reply ingestion paths (provider webhook + inbound-parse webhook) so the
// behavior is identical however a reply arrives.

export async function shouldStopOnReply(
  admin: SupabaseClient,
  campaignId: string | null,
  stepId: string | null
): Promise<boolean> {
  if (stepId) {
    const { data: step } = await admin
      .from("campaign_steps")
      .select("stop_on_reply")
      .eq("id", stepId)
      .maybeSingle();
    const override = (step as { stop_on_reply: boolean | null } | null)
      ?.stop_on_reply;
    if (override === true || override === false) return override;
  }
  if (!campaignId) return true;
  const { data: campaign } = await admin
    .from("campaigns")
    .select("stop_on_reply")
    .eq("id", campaignId)
    .maybeSingle();
  // Campaign default is stop-on-reply unless explicitly disabled.
  return (campaign as { stop_on_reply: boolean | null } | null)?.stop_on_reply !==
    false;
}
