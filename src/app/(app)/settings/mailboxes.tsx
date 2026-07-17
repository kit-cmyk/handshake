"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Plus, Trash2, Mail, CheckCircle2, AlertTriangle } from "lucide-react";
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
import { addMailbox, deleteMailbox, type MailboxState } from "./actions";
import type { Mailbox } from "@/lib/types";

const PROVIDER_LABELS: Record<string, string> = {
  resend: "Resend",
  mock: "Test mode (not delivered)",
  gmail: "Gmail",
  outlook: "Outlook",
};

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
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
  deliveryConfigured,
  connectable,
  canManage,
  banner,
}: {
  mailboxes: Mailbox[];
  deliveryConfigured: boolean;
  connectable: ConnectableProvider[];
  canManage: boolean;
  banner: { kind: "ok" | "error"; text: string } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
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

      {deliveryConfigured && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="text-muted-foreground">
            Email delivery is connected. Campaigns and workflows send from these
            addresses — make sure each one is on a domain you&apos;ve verified
            with your delivery provider.
          </p>
        </div>
      )}

      {mailboxes.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {mailboxes.map((m) => {
            const connected = !!m.oauth_email;
            return (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                <Mail className="size-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {m.display_name ? `${m.display_name} · ` : ""}
                    {m.email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.daily_limit}/day · {providerLabel(m.provider)}
                  </p>
                  {m.connect_error && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="size-3.5" />
                      Reconnect needed — sending is paused for this mailbox.
                    </p>
                  )}
                </div>
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
                    {m.status}
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
              provider. The daily limit caps how many sends this identity makes
              per day to protect sender reputation.
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
