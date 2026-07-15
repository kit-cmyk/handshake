"use client";

import * as React from "react";
import Link from "next/link";
import {
  Mail,
  Webhook,
  MousePointerClick,
  MessageSquare,
  Copy,
  Check,
  ShieldCheck,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  SLACK_EVENTS,
  type SlackEventKey,
} from "@/lib/integrations/slack";
import {
  saveSlackIntegration,
  testSlackIntegration,
  disconnectSlackIntegration,
  type SlackState,
} from "./integrations-actions";
import { CrmIntegrations, type CrmCardData } from "./crm-integrations";
import { BrandGlyph } from "./brand-mark";

type SlackData = {
  connected: boolean;
  enabled: boolean;
  webhookUrl: string;
  events: SlackEventKey[];
};

export function IntegrationsManager({
  baseUrl,
  canManage,
  secretConfigured,
  mailboxCount,
  replyCount,
  lastReplyAt,
  engagementCount,
  slack,
  crm,
}: {
  baseUrl: string;
  canManage: boolean;
  secretConfigured: boolean;
  mailboxCount: number;
  replyCount: number;
  lastReplyAt: string | null;
  engagementCount: number;
  slack: SlackData;
  crm: CrmCardData[];
}) {
  return (
    <div className="space-y-6">
      <Section title="Connected services">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <EmailDeliveryCard mailboxCount={mailboxCount} />
          <SlackCard slack={slack} canManage={canManage} />
        </div>
      </Section>

      <Section
        title="CRM contact sync"
        description="Pull contacts in from another CRM. Handshake dedupes by email, so you can run a sync whenever you want without creating duplicates."
      >
        <CrmIntegrations cards={crm} canManage={canManage} />
      </Section>

      <Section
        title="Webhooks"
        description="Point your email provider's webhooks at these endpoints so replies and engagement flow back into Handshake."
      >
        <Card className="space-y-4 p-5">
          <WebhookRow
            label="Inbound replies"
            hint="Provider inbound-parse / reply forwarding posts here."
            url={`${baseUrl}/api/webhooks/inbound`}
          />
          <WebhookRow
            label="Delivery & tracking events"
            hint="Delivered, opened, clicked, replied, and bounced events."
            url={`${baseUrl}/api/webhooks/email`}
          />
          <div className="flex items-start gap-2 border-t pt-3 text-sm">
            {secretConfigured ? (
              <>
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <p className="text-muted-foreground">
                  Requests are verified. Send your shared secret in the{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                    x-webhook-secret
                  </code>{" "}
                  header (or as a Bearer token).
                </p>
              </>
            ) : (
              <>
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="text-muted-foreground">
                  No webhook secret is set. Add{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                    EMAIL_WEBHOOK_SECRET
                  </code>{" "}
                  in your environment to require a signed{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                    x-webhook-secret
                  </code>{" "}
                  header before going live.
                </p>
              </>
            )}
          </div>
        </Card>
      </Section>

      <Section title="Tracking & more">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatusCard
            icon={MousePointerClick}
            chip="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            name="Open & click tracking"
            description="Engagement is recorded on every send via the tracking webhook."
            badge={{ variant: "success", label: "Active" }}
            footer={
              <p className="text-sm text-muted-foreground">
                {engagementCount > 0
                  ? `${engagementCount.toLocaleString()} opens & clicks in the last 7 days`
                  : "No engagement recorded yet"}
              </p>
            }
          />
          <StatusCard
            icon={Webhook}
            chip="bg-violet-500/15 text-violet-600 dark:text-violet-400"
            name="Reply capture"
            description="Replies are matched back to the campaign and contact that sent them."
            badge={{ variant: "success", label: "Active" }}
            footer={
              <p className="text-sm text-muted-foreground">
                {replyCount > 0
                  ? `${replyCount.toLocaleString()} replies captured · last ${timeAgo(lastReplyAt)}`
                  : "No replies captured yet"}
              </p>
            }
          />
        </div>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ layout */

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function CardShell({
  icon: Icon,
  iconNode,
  chip,
  name,
  description,
  badge,
  children,
}: {
  icon: LucideIcon;
  /** Overrides the lucide icon — used to render a per-integration brand mark. */
  iconNode?: React.ReactNode;
  chip: string;
  name: string;
  description: string;
  badge: { variant: "success" | "secondary" | "outline"; label: string };
  children?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            chip,
          )}
        >
          {iconNode ?? <Icon className="size-5" />}
        </span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
      <div className="space-y-1">
        <p className="font-medium leading-tight">{name}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children && <div className="mt-auto">{children}</div>}
    </Card>
  );
}

function StatusCard(props: React.ComponentProps<typeof CardShell> & {
  footer?: React.ReactNode;
}) {
  const { footer, ...shell } = props;
  return <CardShell {...shell}>{footer}</CardShell>;
}

/* ------------------------------------------------------------- email card */

function EmailDeliveryCard({
  mailboxCount,
}: {
  mailboxCount: number;
}) {
  const badge = mailboxCount > 0
    ? { variant: "success" as const, label: `${mailboxCount} mailbox${mailboxCount === 1 ? "" : "es"}` }
    : { variant: "outline" as const, label: "No mailboxes" };
  return (
    <CardShell
      icon={Mail}
      chip="bg-sky-500/15 text-sky-600 dark:text-sky-400"
      name="Email delivery"
      description="Sending identities used by campaigns and workflows."
      badge={badge}
    >
      <Link
        href="/settings/mailboxes"
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Manage mailboxes
      </Link>
    </CardShell>
  );
}

/* ------------------------------------------------------------- slack card */

function SlackCard({
  slack,
  canManage,
}: {
  slack: SlackData;
  canManage: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [feedback, setFeedback] = React.useState<SlackState | null>(null);

  function runAction(fn: () => Promise<SlackState>) {
    startTransition(async () => {
      setFeedback(await fn());
    });
  }

  const badge = slack.connected
    ? slack.enabled
      ? { variant: "success" as const, label: "Connected" }
      : { variant: "secondary" as const, label: "Paused" }
    : { variant: "outline" as const, label: "Not connected" };

  return (
    <CardShell
      icon={MessageSquare}
      iconNode={<BrandGlyph type="slack" label="Slack" />}
      chip="bg-amber-500/15 text-amber-600 dark:text-amber-400"
      name="Slack"
      description="Get a message in Slack when a lead replies, a deal is won, or a campaign finishes."
      badge={badge}
    >
      <div className="space-y-2">
        {slack.connected && slack.events.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {slack.events.map((key) => (
              <Badge key={key} variant="outline" className="text-xs">
                {SLACK_EVENTS.find((e) => e.key === key)?.label ?? key}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={!canManage}>
                {slack.connected ? "Manage" : "Connect"}
              </Button>
            </DialogTrigger>
            <SlackDialog slack={slack} onSaved={() => setOpen(false)} />
          </Dialog>

          {slack.connected && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={!canManage || pending}
                onClick={() => runAction(testSlackIntegration)}
              >
                Send test
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canManage || pending}
                onClick={() => runAction(disconnectSlackIntegration)}
              >
                Disconnect
              </Button>
            </>
          )}
        </div>

        <div aria-live="polite">
          {feedback?.error && (
            <p className="text-sm text-destructive">{feedback.error}</p>
          )}
          {feedback?.message && (
            <p className="text-sm text-green-600">{feedback.message}</p>
          )}
        </div>

        {!canManage && (
          <p className="text-xs text-muted-foreground">
            Only workspace admins can change this.
          </p>
        )}
      </div>
    </CardShell>
  );
}

function SlackDialog({
  slack,
  onSaved,
}: {
  slack: SlackData;
  onSaved: () => void;
}) {
  const [state, action, pending] = React.useActionState<SlackState, FormData>(
    saveSlackIntegration,
    {},
  );
  const [selected, setSelected] = React.useState<Set<SlackEventKey>>(
    () => new Set(slack.events.length ? slack.events : ["reply"]),
  );

  // Close the dialog once a save succeeds.
  const savedOk = state.ok;
  React.useEffect(() => {
    if (savedOk) onSaved();
  }, [savedOk, onSaved]);

  function toggle(key: SlackEventKey, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Slack notifications</DialogTitle>
        <DialogDescription>
          Paste an{" "}
          <a
            href="https://api.slack.com/messaging/webhooks"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Incoming Webhook
          </a>{" "}
          URL for the channel you want to post to, then pick your events.
        </DialogDescription>
      </DialogHeader>

      <form action={action} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="webhook_url">Incoming Webhook URL</Label>
          <Input
            id="webhook_url"
            name="webhook_url"
            type="url"
            defaultValue={slack.webhookUrl}
            placeholder="https://hooks.slack.com/services/…"
            autoComplete="off"
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Notify me when…</legend>
          {SLACK_EVENTS.map((e) => {
            const on = selected.has(e.key);
            return (
              <label
                key={e.key}
                className="flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5"
              >
                <Checkbox
                  checked={on}
                  onCheckedChange={(c) => toggle(e.key, c)}
                  className="mt-0.5"
                />
                {on && <input type="hidden" name="events" value={e.key} />}
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium leading-none">
                    {e.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {e.description}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        {/* Keep the connection enabled when saving from the dialog. */}
        <input type="hidden" name="enabled" value="true" />

        <div aria-live="polite">
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
        </div>

        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/* --------------------------------------------------------------- webhooks */

function WebhookRow({
  label,
  hint,
  url,
}: {
  label: string;
  hint: string;
  url: string;
}) {
  return (
    <div className="space-y-1.5">
      <div>
        <p className="text-sm font-medium leading-none">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <CopyField value={url} />
    </div>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);

  function copy() {
    navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2 py-1.5 font-mono text-xs">
        {value}
      </code>
      <Button
        variant="outline"
        size="icon"
        className="size-8 shrink-0"
        onClick={copy}
        aria-label="Copy endpoint URL"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}

/* ----------------------------------------------------------------- helper */

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
