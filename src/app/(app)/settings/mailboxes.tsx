"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import {
  Plus,
  Trash2,
  Mail,
  CheckCircle2,
  AlertTriangle,
  Send,
  Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  addMailbox,
  deleteMailbox,
  sendMailboxTest,
  updateMailboxLimit,
  type MailboxState,
} from "./actions";
import type { Mailbox } from "@/lib/types";
import { statusLabel } from "@/lib/utils";
import { isMailboxProviderType } from "@/lib/email/mailbox-providers";

const PROVIDER_LABELS: Record<string, string> = {
  resend: "Resend",
  mock: "Test mode (not delivered)",
  gmail: "Gmail",
  outlook: "Outlook",
};

/**
 * A mailbox's `provider` column is a snapshot taken when it was added, so a row
 * created before the delivery key was configured keeps reporting "Test mode"
 * forever — long after sends through it started working. Only a connected
 * account's provider is really a property of the row; for everything else the
 * server's live delivery provider is the truth, so prefer it.
 */
function providerLabel(provider: string, deliveryProvider: string): string {
  const effective = isMailboxProviderType(provider) ? provider : deliveryProvider;
  return PROVIDER_LABELS[effective] ?? effective;
}

/**
 * Turn a stored `connect_error` into something a user can act on.
 *
 * The column holds whatever the provider said, verbatim — e.g. Resend's
 * `403: {"statusCode":403,"message":"The gmail.com domain is not verified..."}`.
 * Dumping raw JSON with a status code into settings tells the reader something
 * is broken but not what to do about it, so the cases we recognise get a
 * sentence instead. Anything unrecognised still shows through: a wrong
 * explanation would be worse than an ugly true one.
 */
function explainConnectError(error: string, email: string): string {
  if (/domain is not verified/i.test(error)) {
    const domain = email.split("@")[1] ?? "this domain";
    return `Your delivery provider won't send from ${domain} because that domain isn't verified with it. Connect this account directly, or use an address on a domain you've verified.`;
  }
  if (/^40[13]/.test(error))
    return "The provider refused the last send from this mailbox. Reconnect it, or check the address is one it's allowed to send as.";
  if (/reconnect|refresh failed/i.test(error))
    return "Reconnect needed — sending is paused for this mailbox.";
  return error;
}

/** Inline editor for a mailbox's daily send cap. */
function DailyLimitEditor({
  mailbox,
  ceiling,
  onSaved,
}: {
  mailbox: Mailbox;
  /** Provider ceiling for a connected account; null when uncapped by a provider. */
  ceiling: number | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(String(mailbox.daily_limit));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await updateMailboxLimit(mailbox.id, Number(value));
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setOpen(false);
    onSaved();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs">
          <Gauge className="size-3.5" /> Limit
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3">
        <div className="space-y-1">
          <Label htmlFor={`limit-${mailbox.id}`} className="text-sm">
            Daily send limit
          </Label>
          <p className="text-xs text-muted-foreground">
            {ceiling
              ? `Handshake pauses this mailbox once it hits the limit and resumes at midnight UTC. ${mailbox.email.split("@")[1]} allows up to ${ceiling.toLocaleString()} a day; staying under it keeps sends from being rejected.`
              : "Handshake pauses this mailbox once it hits the limit and resumes at midnight UTC."}
          </p>
        </div>
        <Input
          id={`limit-${mailbox.id}`}
          type="number"
          min={1}
          max={ceiling ?? undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button size="sm" onClick={save} disabled={saving} className="w-full">
          {saving ? "Saving…" : "Save limit"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** A connectable OAuth mailbox provider whose app is configured on the server. */
type ConnectableProvider = {
  type: string;
  label: string;
  description: string;
  chip: string;
};

export function Mailboxes({
  mailboxes,
  deliveryProvider,
  connectable,
  usage,
  ceilings,
  canManage,
  banner,
}: {
  mailboxes: Mailbox[];
  /** Live global delivery provider name, e.g. "resend" or "mock". */
  deliveryProvider: string;
  connectable: ConnectableProvider[];
  /** Sends already booked against each mailbox today (UTC), by mailbox id. */
  usage: Record<string, number>;
  /** Provider hard ceiling per connected mailbox id; absent = not provider-capped. */
  ceilings: Record<string, number>;
  canManage: boolean;
  banner: { kind: "ok" | "error"; text: string } | null;
}) {
  // "mock" is the provider used when no delivery API key is set — it logs and
  // claims success, so it must never read as configured.
  const deliveryConfigured = deliveryProvider !== "mock";
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  // Which row's test is in flight, and the last result — keyed by mailbox id so
  // the message lands under the row it belongs to.
  const [testing, setTesting] = React.useState<string | null>(null);
  const [testResult, setTestResult] = React.useState<{
    id: string;
    ok: boolean;
    text: string;
  } | null>(null);

  async function runTest(id: string) {
    setTesting(id);
    setTestResult(null);
    const res = await sendMailboxTest(id);
    setTesting(null);
    setTestResult({
      id,
      ok: !!res.ok,
      text: res.ok
        ? "Test sent — check your inbox."
        : (res.error ?? "The test send failed."),
    });
    // A test clears connect_error on success, so refresh to drop the warning.
    if (res.ok) router.refresh();
  }
  const [state, formAction, pending] = useActionState<MailboxState, FormData>(
    addMailbox,
    {}
  );
  React.useEffect(() => {
    if (state.ok) {
      // Reacts to a form-submit result; the effect is required for router.refresh().
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="space-y-4">
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

      {deliveryConfigured ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="text-muted-foreground">
            Email delivery is connected. A <strong>connected</strong> Gmail or
            Outlook account sends through the account itself, so it needs no
            domain verification; any other address here goes through the shared
            delivery provider and must be on a domain you&apos;ve verified with
            it. Handshake keeps every mailbox under its own daily limit and
            pauses it until midnight UTC when it&apos;s reached.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-muted-foreground">
            Email delivery isn&apos;t configured on this server, so these
            mailboxes are in test mode — campaigns, workflows and test sends are
            recorded but <strong>no message actually leaves</strong>. Connect a
            Gmail or Outlook account, or set a delivery provider API key.
          </p>
        </div>
      )}

      {mailboxes.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {mailboxes.map((m) => {
            const connected = !!m.oauth_email;
            const sentToday = usage[m.id] ?? 0;
            const atCap = m.daily_limit > 0 && sentToday >= m.daily_limit;
            return (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                <Mail className="size-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {m.display_name ? `${m.display_name} · ` : ""}
                    {m.email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {sentToday > 0
                      ? `${sentToday.toLocaleString()} of ${m.daily_limit.toLocaleString()} sent today`
                      : `${m.daily_limit.toLocaleString()}/day`}{" "}
                    · {providerLabel(m.provider, deliveryProvider)}
                    {atCap && (
                      <>
                        {" · "}
                        <span className="text-amber-600 dark:text-amber-400">
                          daily limit reached, resumes at midnight UTC
                        </span>
                      </>
                    )}
                  </p>
                  {m.connect_error && (
                    <p className="mt-1 flex items-start gap-1 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      {explainConnectError(m.connect_error, m.email)}
                    </p>
                  )}
                  {testResult?.id === m.id && (
                    <p
                      className={
                        testResult.ok
                          ? "mt-1 text-xs text-emerald-600 dark:text-emerald-400"
                          : "mt-1 text-xs text-destructive"
                      }
                    >
                      {testResult.text}
                    </p>
                  )}
                </div>
                {canManage && (
                  <DailyLimitEditor
                    mailbox={m}
                    ceiling={ceilings[m.id] ?? null}
                    onSaved={() => router.refresh()}
                  />
                )}
                {canManage && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={testing === m.id}
                    onClick={() => runTest(m.id)}
                  >
                    <Send className="size-4" />
                    {testing === m.id ? "Sending…" : "Send test"}
                  </Button>
                )}
                {connected &&
                  canManage &&
                  (m.connect_error ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={`/api/mailboxes/${m.provider}/connect`}>Reconnect</a>
                    </Button>
                  ) : (
                    <Badge variant="success">Connected</Badge>
                  ))}
                {!connected && (
                  <Badge variant={m.status === "active" ? "success" : "secondary"}>
                    {statusLabel(m.status)}
                  </Badge>
                )}
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon" className="size-8">
                      <Trash2 className="size-4" />
                    </Button>
                  }
                  title={connected ? "Disconnect mailbox?" : "Remove mailbox?"}
                  description={
                    connected
                      ? `Handshake will forget its access to ${m.email} and campaigns can no longer send from it. You can reconnect anytime.`
                      : `Campaigns can no longer send from ${m.email}. This can't be undone.`
                  }
                  confirmLabel={connected ? "Disconnect" : "Remove"}
                  pendingLabel={connected ? "Disconnecting…" : "Removing…"}
                  onConfirm={async () => {
                    await deleteMailbox(m.id);
                    router.refresh();
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}

      {canManage && connectable.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Connecting your own Gmail or Outlook account isn&apos;t available on
          this server — its OAuth app isn&apos;t configured. Until it is, every
          mailbox here sends through the shared delivery provider and must be on
          a domain you&apos;ve verified with it.
        </p>
      )}

      {canManage && connectable.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {connectable.map((p) => (
            <Button key={p.type} asChild variant="outline" size="sm">
              <a href={`/api/mailboxes/${p.type}/connect`}>
                <Mail className="size-4" /> Connect {p.label}
              </a>
            </Button>
          ))}
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm">
            <Plus className="size-4" /> Add mailbox
          </Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Add mailbox</SheetTitle>
          </SheetHeader>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Sending email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@company.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="display_name">Display name</Label>
              <Input id="display_name" name="display_name" placeholder="Jane at Acme" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="daily_limit">Daily limit</Label>
              <Input
                id="daily_limit"
                name="daily_limit"
                type="number"
                defaultValue={200}
              />
            </div>
            {state.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Use an address on a domain you&apos;ve verified with your delivery
              provider — a personal Gmail or Outlook address won&apos;t work here,
              because that domain can&apos;t be verified. To send from one of
              those, connect the account instead. The daily limit caps how many
              sends this identity makes per day to protect sender reputation.
            </p>
            <SheetFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Adding…" : "Add mailbox"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
