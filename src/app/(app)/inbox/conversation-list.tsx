"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Building2, Inbox as InboxIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { LifecycleBadge } from "@/components/lifecycle-badge";
import {
  DEAL_PRIORITY_LABELS,
  type ConversationStatus,
  type DealPriority,
  type LifecycleStage,
  type MessageDirection,
} from "@/lib/types";
import type { InboxTab } from "./inbox-filters";

export type ConvRow = {
  id: string;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  companyId: string | null;
  companyName: string | null;
  status: ConversationStatus;
  assigneeId: string | null;
  lastMessageAt: string | null;
  snippet: string | null;
  direction: MessageDirection | null;
  unread: boolean;
  lifecycle: LifecycleStage;
  /** Primary deal for the contact (open, highest value) — null if none. */
  dealStage: string | null;
  dealValue: number | null;
  dealPriority: DealPriority | null;
};

const PRIORITY_VARIANT: Record<
  DealPriority,
  "secondary" | "warning" | "destructive"
> = {
  low: "secondary",
  medium: "warning",
  high: "destructive",
};

function formatMoney(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export type Person = { name: string; avatar: string };
export type PersonMap = Record<string, Person>;

/** Compact relative time, e.g. "2m", "3h", "Apr 4". */
export function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function ConversationList({
  rows,
  tab,
  selectedId,
}: {
  rows: ConvRow[];
  tab: InboxTab;
  selectedId: string | null;
  people: PersonMap;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  const hrefFor = (id: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("c", id);
    return `${pathname}?${next.toString()}`;
  };

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <InboxIcon className="size-6" />
        <p>No conversations here yet.</p>
      </div>
    );
  }

  if (tab === "companies") {
    // Group rows under their company (contacts with no company last).
    const groups = new Map<string, { name: string; rows: ConvRow[] }>();
    for (const r of rows) {
      const key = r.companyId ?? "__none__";
      if (!groups.has(key))
        groups.set(key, { name: r.companyName ?? "No company", rows: [] });
      groups.get(key)!.rows.push(r);
    }
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        {[...groups.values()].map((g) => (
          <div key={g.name}>
            <div className="sticky top-0 z-10 flex items-center gap-1.5 bg-muted/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur">
              <Building2 className="size-3.5" />
              {g.name}
              <span className="ml-auto font-normal">{g.rows.length}</span>
            </div>
            {g.rows.map((r) => (
              <Row
                key={r.id}
                row={r}
                href={hrefFor(r.id)}
                active={r.id === selectedId}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {rows.map((r) => (
        <Row key={r.id} row={r} href={hrefFor(r.id)} active={r.id === selectedId} />
      ))}
    </div>
  );
}

function Row({
  row,
  href,
  active,
}: {
  row: ConvRow;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex gap-3 border-b px-3 py-2.5 transition-colors",
        active ? "bg-accent" : "hover:bg-accent/50"
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
          row.unread
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground"
        )}
      >
        {initials(row.contactName) || "?"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-sm",
              row.unread ? "font-semibold text-foreground" : "font-medium"
            )}
          >
            {row.contactName}
          </span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {relativeTime(row.lastMessageAt)}
          </span>
        </div>
        <p
          className={cn(
            "truncate text-xs",
            row.unread ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {row.direction === "outbound" && (
            <span className="text-muted-foreground">You: </span>
          )}
          {row.snippet || "No messages yet"}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {row.dealStage ? (
            <>
              <Badge variant="outline" className="font-normal">
                {row.dealStage}
              </Badge>
              {formatMoney(row.dealValue) && (
                <span className="text-xs font-medium text-foreground">
                  {formatMoney(row.dealValue)}
                </span>
              )}
              {row.dealPriority && (
                <Badge variant={PRIORITY_VARIANT[row.dealPriority]}>
                  {DEAL_PRIORITY_LABELS[row.dealPriority]}
                </Badge>
              )}
            </>
          ) : (
            <LifecycleBadge stage={row.lifecycle} />
          )}
        </div>
      </div>
      {row.unread && (
        <span className="mt-1 size-2 shrink-0 self-start rounded-full bg-primary" />
      )}
    </Link>
  );
}
