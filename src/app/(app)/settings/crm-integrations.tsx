"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CRM_PROVIDERS, type CrmProviderType } from "@/lib/crm/providers";
import { BrandGlyph } from "./brand-mark";
import {
  saveCrmIntegration,
  connectCrmMock,
  syncCrmNow,
  toggleCrmIntegration,
  disconnectCrmIntegration,
  type CrmState,
} from "./crm-actions";

export type CrmLastSync = {
  status: "pending" | "running" | "completed" | "failed";
  mode: "live" | "mock";
  created: number;
  updated: number;
  at: string;
};

export type CrmCardData = {
  type: CrmProviderType;
  auth: "token" | "oauth";
  connected: boolean;
  enabled: boolean;
  /** This connection currently holds usable live credentials. */
  live: boolean;
  /** The live connect path is available (token always; oauth needs env creds). */
  liveConfigured: boolean;
  /** Non-secret stored field values, for prefilling the token form. */
  savedFields: Record<string, string>;
  lastSync: CrmLastSync | null;
};

export function CrmIntegrations({
  cards,
  canManage,
}: {
  cards: CrmCardData[];
  canManage: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <CrmCard key={card.type} card={card} canManage={canManage} />
      ))}
    </div>
  );
}

function CrmCard({ card, canManage }: { card: CrmCardData; canManage: boolean }) {
  const meta = CRM_PROVIDERS.find((p) => p.type === card.type)!;
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [feedback, setFeedback] = React.useState<CrmState | null>(null);

  function runAction(fn: () => Promise<CrmState>) {
    startTransition(async () => setFeedback(await fn()));
  }

  const badge = !card.connected
    ? { variant: "outline" as const, label: "Not connected" }
    : !card.enabled
      ? { variant: "secondary" as const, label: "Paused" }
      : card.live
        ? { variant: "success" as const, label: "Connected" }
        : { variant: "outline" as const, label: "Demo mode" };

  const connectHref = `/api/crm/${card.type}/connect`;
  const isToken = card.auth === "token";

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            meta.chip,
          )}
        >
          <BrandGlyph type={card.type} label={meta.label} />
        </span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      <div className="space-y-1">
        <p className="font-medium leading-tight">{meta.label}</p>
        <p className="text-sm text-muted-foreground">{meta.description}</p>
      </div>

      <div className="mt-auto space-y-2">
        <p className="text-xs text-muted-foreground">
          {card.lastSync ? (
            <>
              Last sync {timeAgo(card.lastSync.at)}
              {card.lastSync.status === "failed"
                ? " — failed"
                : ` — ${card.lastSync.created} added, ${card.lastSync.updated} updated`}
              {card.lastSync.mode === "mock" ? " (demo)" : ""}
            </>
          ) : card.connected ? (
            "Never synced yet"
          ) : isToken ? (
            "Paste your API credentials to start syncing"
          ) : card.liveConfigured ? (
            "Connect your account to start syncing"
          ) : (
            "Connect in demo mode to preview the sync"
          )}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {/* Connect / Manage */}
          {isToken ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={!canManage}>
                  {card.connected ? "Manage" : "Connect"}
                </Button>
              </DialogTrigger>
              <TokenDialog card={card} onSaved={() => setOpen(false)} />
            </Dialog>
          ) : !card.connected ? (
            card.liveConfigured ? (
              <a
                href={connectHref}
                className={buttonVariants({ variant: "outline", size: "sm" })}
                aria-disabled={!canManage}
                onClick={(e) => !canManage && e.preventDefault()}
              >
                Connect
              </a>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={!canManage || pending}
                onClick={() => runAction(() => connectCrmMock(card.type))}
              >
                Try demo
              </Button>
            )
          ) : null}

          {/* Connected controls */}
          {card.connected && (
            <>
              <Button
                size="sm"
                disabled={!canManage || pending}
                onClick={() => runAction(() => syncCrmNow(card.type))}
              >
                <RefreshCw className={cn("size-4", pending && "animate-spin")} />
                Sync now
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canManage || pending}
                onClick={() =>
                  runAction(() => toggleCrmIntegration(card.type, !card.enabled))
                }
              >
                {card.enabled ? "Pause" : "Resume"}
              </Button>
              {!isToken && !card.live && card.liveConfigured && (
                <a
                  href={connectHref}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Connect live
                </a>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={!canManage || pending}
                onClick={() => runAction(() => disconnectCrmIntegration(card.type))}
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
    </Card>
  );
}

function TokenDialog({
  card,
  onSaved,
}: {
  card: CrmCardData;
  onSaved: () => void;
}) {
  const meta = CRM_PROVIDERS.find((p) => p.type === card.type)!;
  const [state, action, pending] = React.useActionState<CrmState, FormData>(
    saveCrmIntegration,
    {},
  );

  const savedOk = state.ok;
  React.useEffect(() => {
    if (savedOk) onSaved();
  }, [savedOk, onSaved]);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Connect {meta.label}</DialogTitle>
        <DialogDescription>
          Handshake pulls your {meta.label} contacts whenever you run a sync,
          deduping by email. Find your credentials in the{" "}
          <a
            href={meta.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {meta.label} docs
          </a>
          . Leave the fields blank to try it with demo data first.
        </DialogDescription>
      </DialogHeader>

      <form action={action} className="space-y-4">
        <input type="hidden" name="type" value={card.type} />
        {meta.fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`${card.type}-${field.key}`}>{field.label}</Label>
            <Input
              id={`${card.type}-${field.key}`}
              name={field.key}
              type={field.secret ? "password" : "text"}
              defaultValue={field.secret ? "" : card.savedFields[field.key] ?? ""}
              placeholder={
                field.secret && card.connected
                  ? "•••••••• (leave blank to keep)"
                  : field.placeholder
              }
              autoComplete="off"
            />
            {field.hint && (
              <p className="text-xs text-muted-foreground">{field.hint}</p>
            )}
          </div>
        ))}

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
