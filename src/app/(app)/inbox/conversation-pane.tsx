"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Inbox as InboxIcon,
  Mail,
  StickyNote,
  Phone,
  CheckSquare,
  CalendarClock,
  Activity as ActivityIcon,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { eventLabel } from "@/lib/inbox/timeline";
import { stripHtml } from "@/lib/inbox/inbound";
import type { ActivityType, TimelineEntry } from "@/lib/types";
import { UserAvatar } from "@/components/user-avatar";
import type { ConvRow, PersonMap } from "./conversation-list";
import { Composer } from "./composer";
import {
  assignConversation,
  markConversationRead,
  setConversationStatus,
} from "./actions";

const ACTIVITY_ICON: Record<ActivityType, typeof StickyNote> = {
  note: StickyNote,
  call: Phone,
  task: CheckSquare,
  email: Mail,
  appointment: CalendarClock,
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export function ConversationPane({
  conversation,
  timeline,
  people,
  currentUserId,
}: {
  conversation: ConvRow | null;
  timeline: TimelineEntry[];
  people: PersonMap;
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const bottomRef = React.useRef<HTMLDivElement>(null);

  const convId = conversation?.id ?? null;
  const wasUnread = conversation?.unread ?? false;

  // Mark read once when an unread conversation is opened.
  React.useEffect(() => {
    if (convId && wasUnread) {
      markConversationRead(convId);
    }
  }, [convId, wasUnread]);

  // Keep the newest entry in view.
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [convId, timeline.length]);

  if (!conversation) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <InboxIcon className="size-8" />
        <p>Select a conversation to view the thread.</p>
      </div>
    );
  }

  const assignedToMe = conversation.assigneeId === currentUserId;
  const closed = conversation.status === "closed";

  return (
    <div className="flex min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold">
              {conversation.contactName}
            </h2>
            {conversation.companyName && (
              <span className="truncate text-sm text-muted-foreground">
                · {conversation.companyName}
              </span>
            )}
            {closed && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                Closed
              </span>
            )}
          </div>
          {conversation.contactEmail && (
            <p className="truncate text-xs text-muted-foreground">
              {conversation.contactEmail}
            </p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => start(() => assignConversation(conversation.id, !assignedToMe))}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            title={assignedToMe ? "Unassign" : "Assign to me"}
          >
            <UserPlus className="size-4" />
            {assignedToMe ? "Assigned to you" : "Assign to me"}
          </button>
          <button
            onClick={() =>
              start(() =>
                setConversationStatus(conversation.id, closed ? "open" : "closed")
              )
            }
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          >
            {closed ? <Circle className="size-4" /> : <CheckCircle2 className="size-4" />}
            {closed ? "Reopen" : "Close"}
          </button>
          <Link
            href={`/contacts/${conversation.contactId}`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Contact <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </div>

      {/* Timeline */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {timeline.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No activity yet. Start the conversation below.
          </p>
        ) : (
          timeline.map((entry) => (
            <TimelineRow
              key={
                entry.kind === "message"
                  ? `m-${entry.message.id}`
                  : entry.kind === "activity"
                    ? `a-${entry.activity.id}`
                    : `e-${entry.event.id}`
              }
              entry={entry}
              people={people}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <Composer
        conversationId={conversation.id}
        contactId={conversation.contactId}
        contactEmail={conversation.contactEmail}
        onDone={() => router.refresh()}
      />
    </div>
  );
}

function TimelineRow({
  entry,
  people,
}: {
  entry: TimelineEntry;
  people: PersonMap;
}) {
  if (entry.kind === "event") {
    return (
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ActivityIcon className="size-3.5" />
        <span>{eventLabel(entry.event.type, entry.event.metadata)}</span>
        <span>·</span>
        <span>{fmtTime(entry.at)}</span>
      </div>
    );
  }

  if (entry.kind === "activity") {
    const a = entry.activity;
    const Icon = ACTIVITY_ICON[a.type] ?? StickyNote;
    const who = a.user_id ? people[a.user_id]?.name : null;
    return (
      <div className="flex gap-2.5 rounded-md bg-muted/40 p-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap text-sm">{a.body}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="capitalize">{a.type}</span>
            {who && <> · {who}</>} · {fmtTime(a.created_at)}
          </p>
        </div>
      </div>
    );
  }

  // Message bubble.
  const m = entry.message;
  const outbound = m.direction === "outbound";
  const sender = outbound
    ? m.user_id
      ? people[m.user_id]
      : null
    : null;

  return (
    <div className={cn("flex gap-2.5", outbound && "flex-row-reverse")}>
      {sender ? (
        <UserAvatar src={sender.avatar} alt={sender.name} className="size-7" />
      ) : (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Mail className="size-3.5" />
        </span>
      )}
      <div className={cn("max-w-[80%] min-w-0", outbound && "text-right")}>
        {m.subject && (
          <p className="mb-0.5 text-xs font-medium text-muted-foreground">
            {m.subject}
          </p>
        )}
        <div
          className={cn(
            "inline-block rounded-lg px-3 py-2 text-left text-sm",
            outbound
              ? "bg-primary text-primary-foreground"
              : "border bg-card"
          )}
        >
          {outbound && m.body_html ? (
            // Outbound bodies are authored in-app (same trust as campaigns).
            <div
              className="prose-sm [&_p]:my-1"
              dangerouslySetInnerHTML={{ __html: m.body_html }}
            />
          ) : (
            <p className="whitespace-pre-wrap">
              {m.body_text || (m.body_html ? stripHtml(m.body_html) : m.snippet)}
            </p>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {outbound ? sender?.name ?? "You" : "Contact"} · {fmtTime(m.created_at)}
        </p>
      </div>
    </div>
  );
}
