import { requireContext } from "@/lib/context";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Mailboxes } from "../mailboxes";
import { getEmailProvider } from "@/lib/email/provider";
import {
  offeredMailboxProviders,
  mailboxProviderLabel,
  isMailboxProviderType,
  dailyLimitCeiling,
} from "@/lib/email/mailbox-providers";
import { sendsToday } from "@/lib/email/send-cap";
import { isMailboxProviderConfigured } from "@/lib/email/mailbox-oauth";
import type { Mailbox } from "@/lib/types";

// Columns safe to hand to the client — deliberately excludes the encrypted
// access_token / refresh_token / token_expires_at so credentials never reach
// the browser.
const MAILBOX_UI_COLUMNS =
  "id, org_id, user_id, provider, email, display_name, daily_limit, status, created_at, oauth_email, connect_error";

const MAILBOX_ERRORS: Record<string, string> = {
  unknown: "That mailbox provider isn't supported.",
  forbidden: "Only workspace admins can connect a mailbox.",
  not_configured: "That provider's OAuth app isn't configured on this server yet.",
  denied: "The connection was cancelled.",
  state: "The connection expired or couldn't be verified — please try again.",
  exchange: "Couldn't complete the connection with the provider.",
  save: "Connected, but saving the mailbox failed. Try again.",
};

export default async function MailboxesSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, org } = await requireContext();
  const canManage = ["owner", "admin"].includes(org.role);

  const { data: mailboxes } = await supabase
    .from("mailboxes")
    .select(MAILBOX_UI_COLUMNS)
    .eq("org_id", org.id)
    .order("created_at");

  // Providers we advertise AND whose OAuth app is configured on this server —
  // an unconfigured provider can't run the connect flow, so we don't offer it.
  const connectable = offeredMailboxProviders()
    .filter((p) => isMailboxProviderConfigured(p.type))
    .map((p) => ({ type: p.type, label: p.label, description: p.description, chip: p.chip }));

  const rows = (mailboxes ?? []) as Mailbox[];

  // Today's usage per mailbox, so a row can say "412 of 500 sent today" rather
  // than only advertising a limit the user has no way to see themselves against.
  const usage = await sendsToday(
    supabase,
    org.id,
    rows.map((m) => m.id)
  );

  // The provider's hard ceiling, for connected accounts only — it's what the
  // limit editor clamps to and explains. An address-only row has no such
  // ceiling; its delivery provider's limits aren't per-mailbox.
  const ceilings: Record<string, number> = {};
  for (const m of rows) {
    if (m.oauth_email && isMailboxProviderType(m.provider))
      ceilings[m.id] = dailyLimitCeiling(m.provider, m.oauth_email);
  }

  const sp = (await searchParams) ?? {};
  const connected = typeof sp.mailbox_connected === "string" ? sp.mailbox_connected : null;
  const errorParam = typeof sp.mailbox_error === "string" ? sp.mailbox_error : null;
  const banner =
    connected && isMailboxProviderType(connected)
      ? {
          kind: "ok" as const,
          text: `${mailboxProviderLabel(connected)} connected. Campaigns and replies can now send from it.`,
        }
      : errorParam
        ? { kind: "error" as const, text: MAILBOX_ERRORS[errorParam] ?? "Couldn't connect that mailbox." }
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mailboxes</CardTitle>
        <CardDescription>
          Sending identities used by your campaigns and workflows. Connect your
          own Gmail or Outlook account to send as yourself.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Mailboxes
          mailboxes={rows}
          deliveryProvider={getEmailProvider().name}
          connectable={connectable}
          usage={usage}
          ceilings={ceilings}
          canManage={canManage}
          banner={banner}
        />
      </CardContent>
    </Card>
  );
}
