import { headers } from "next/headers";
import { requireContext } from "@/lib/context";
import { IntegrationsManager } from "../integrations-manager";
import type { CrmCardData } from "../crm-integrations";
import type { SlackConfig, SlackEventKey } from "@/lib/integrations/slack";
import {
  CRM_PROVIDERS,
  CRM_PROVIDERS_TYPES,
  crmLabel,
  isCrmProviderType,
} from "@/lib/crm/providers";
import {
  isConnectionLive,
  isLiveConfigured,
  publicTokenFields,
  type CrmConnectionConfig,
} from "@/lib/crm/connection";

/** ISO timestamp `days` days before now (kept out of render for purity). */
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 864e5).toISOString();
}

const CRM_ERRORS: Record<string, string> = {
  unknown: "That CRM isn't supported.",
  forbidden: "Only workspace admins can connect a CRM.",
  not_configured: "That CRM's OAuth app isn't configured on this server yet.",
  denied: "The connection was cancelled.",
  state: "The connection expired or couldn't be verified — please try again.",
  exchange: "Couldn't complete the connection with the provider.",
  save: "Connected, but saving the connection failed. Try again.",
};

export default async function IntegrationsSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, org } = await requireContext();
  const canManage = ["owner", "admin"].includes(org.role);

  const sevenDaysAgo = daysAgoIso(7);

  const [
    { count: mailboxCount },
    { count: replyCount },
    lastReply,
    { count: engagementCount },
    slackRow,
    crmRows,
    syncRuns,
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
    supabase
      .from("org_integrations")
      .select("type, config, enabled")
      .eq("org_id", org.id)
      .in("type", [...CRM_PROVIDERS_TYPES]),
    supabase
      .from("crm_sync_runs")
      .select("provider, status, mode, created, updated, created_at")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const slackConfig = (slackRow.data?.config ?? null) as Partial<SlackConfig> | null;

  // Build the per-provider CRM card data.
  const crmRowByType = new Map(
    (crmRows.data ?? []).map((r) => [r.type as string, r]),
  );
  const lastRunByType = new Map<string, NonNullable<typeof syncRuns.data>[number]>();
  for (const run of syncRuns.data ?? []) {
    if (!lastRunByType.has(run.provider)) lastRunByType.set(run.provider, run);
  }
  const crm: CrmCardData[] = CRM_PROVIDERS.map((p) => {
    const row = crmRowByType.get(p.type);
    const config = (row?.config ?? null) as CrmConnectionConfig | null;
    const last = lastRunByType.get(p.type);
    return {
      type: p.type,
      auth: p.auth,
      connected: !!row,
      enabled: (row?.enabled ?? true) as boolean,
      live: isConnectionLive(p.type, config),
      liveConfigured: isLiveConfigured(p.type),
      savedFields: publicTokenFields(p.type, config),
      lastSync: last
        ? {
            status: last.status,
            mode: last.mode,
            created: last.created,
            updated: last.updated,
            at: last.created_at,
          }
        : null,
    };
  });

  // Resolve the app's public base URL for webhook endpoints.
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (host ? `${proto}://${host}` : "http://localhost:3000");

  // Connect-flow result banner (set by the OAuth callback redirect).
  const sp = (await searchParams) ?? {};
  const connectedParam = typeof sp.crm_connected === "string" ? sp.crm_connected : null;
  const errorParam = typeof sp.crm_error === "string" ? sp.crm_error : null;
  const banner = connectedParam && isCrmProviderType(connectedParam)
    ? { kind: "ok" as const, text: `${crmLabel(connectedParam)} connected. Run a sync to pull your contacts.` }
    : errorParam
      ? { kind: "error" as const, text: CRM_ERRORS[errorParam] ?? "Couldn't connect that CRM." }
      : null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Connect Handshake to the tools that send, receive, and act on your
          outreach.
        </p>
      </div>
      {banner && (
        <p
          className={
            banner.kind === "ok"
              ? "rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
              : "rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          }
        >
          {banner.text}
        </p>
      )}
      <IntegrationsManager
        baseUrl={baseUrl}
        canManage={canManage}
        secretConfigured={!!process.env.EMAIL_WEBHOOK_SECRET}
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
        crm={crm}
      />
    </div>
  );
}
