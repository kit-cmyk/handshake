import { headers } from "next/headers";
import { requireContext } from "@/lib/context";
import { IntegrationsManager } from "../integrations-manager";
import { isEmailDeliveryConfigured } from "@/lib/email/provider";
import type { SlackConfig, SlackEventKey } from "@/lib/integrations/slack";

/** ISO timestamp `days` days before now (kept out of render for purity). */
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 864e5).toISOString();
}

export default async function IntegrationsSettingsPage() {
  const { supabase, org } = await requireContext();
  const canManage = ["owner", "admin"].includes(org.role);

  const sevenDaysAgo = daysAgoIso(7);

  const [
    { count: mailboxCount },
    { count: replyCount },
    lastReply,
    { count: engagementCount },
    slackRow,
  ] = await Promise.all([
    supabase
      .from("mailboxes")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id),
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("type", "replied"),
    supabase
      .from("events")
      .select("occurred_at")
      .eq("org_id", org.id)
      .eq("type", "replied")
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .in("type", ["opened", "clicked"])
      .gte("occurred_at", sevenDaysAgo),
    supabase
      .from("org_integrations")
      .select("config, enabled")
      .eq("org_id", org.id)
      .eq("type", "slack")
      .maybeSingle(),
  ]);

  const slackConfig = (slackRow.data?.config ?? null) as Partial<SlackConfig> | null;

  // Resolve the app's public base URL for webhook endpoints.
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (host ? `${proto}://${host}` : "http://localhost:3000");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Connect Handshake to the tools that send, receive, and act on your
          outreach.
        </p>
      </div>
      <IntegrationsManager
        baseUrl={baseUrl}
        canManage={canManage}
        secretConfigured={!!process.env.EMAIL_WEBHOOK_SECRET}
        deliveryConfigured={isEmailDeliveryConfigured()}
        mailboxCount={mailboxCount ?? 0}
        replyCount={replyCount ?? 0}
        lastReplyAt={lastReply.data?.occurred_at ?? null}
        engagementCount={engagementCount ?? 0}
        slack={{
          connected: !!slackRow.data,
          enabled: slackRow.data?.enabled ?? true,
          webhookUrl: slackConfig?.webhook_url ?? "",
          events: (slackConfig?.events ?? []) as SlackEventKey[],
        }}
      />
    </div>
  );
}
