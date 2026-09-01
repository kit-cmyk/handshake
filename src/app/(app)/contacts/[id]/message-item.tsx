"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { stripHtml } from "@/lib/inbox/inbound";
import type { Message } from "@/lib/types";

/**
 * One Inbox email on the contact timeline.
 *
 * Read-only on purpose: a sent or received email is a record of something that
 * happened, so unlike an activity it has no delete control — the thread in the
 * Inbox is where a conversation is managed.
 */
export function MessageItem({ message }: { message: Message }) {
  const outbound = message.direction === "outbound";
  const Icon = outbound ? ArrowUpRight : ArrowDownLeft;
  const preview =
    message.snippet ||
    message.body_text ||
    (message.body_html ? stripHtml(message.body_html) : "");
  const via = message.campaign_id
    ? "campaign"
    : message.workflow_id
      ? "workflow"
      : null;

  return (
    <li className="flex gap-3 py-3">
      <div className="mt-0.5 text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {message.subject || "(no subject)"}
        </p>
        {preview && (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
            {preview}
          </p>
        )}
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{outbound ? "Email sent" : "Email received"}</span>
          {via && (
            <>
              <span>·</span>
              <span>via {via}</span>
            </>
          )}
          <span>·</span>
          <span>{new Date(message.created_at).toLocaleString()}</span>
        </div>
      </div>
    </li>
  );
}
