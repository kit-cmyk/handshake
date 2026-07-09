// Pure helpers for the inbox timeline: merge the three activity sources
// (messages, activities, funnel events) into one chronological stream, and
// label the events that are worth surfacing. Kept side-effect-free so it is
// unit-testable and reusable by the server component and any future callers.

import type { Activity, Message, TimelineEntry } from "@/lib/types";

export type TimelineEvent = {
  id: string;
  type: string;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
};

/**
 * Event types worth showing in the timeline as system lines. `replied` is
 * intentionally excluded — the reply body now renders as an inbound message
 * bubble, so a system line would duplicate it. One-off inbox sends are stored
 * as message bubbles (no `sent` event), so `sent` here means a campaign send.
 */
export const TIMELINE_EVENT_TYPES = [
  "sent",
  "opened",
  "clicked",
  "bounced",
  "stage_moved",
] as const;

export function buildTimeline(input: {
  messages: Message[];
  activities: Activity[];
  events: TimelineEvent[];
}): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...input.messages.map(
      (m): TimelineEntry => ({ kind: "message", at: m.created_at, message: m })
    ),
    ...input.activities.map(
      (a): TimelineEntry => ({ kind: "activity", at: a.created_at, activity: a })
    ),
    ...input.events.map(
      (e): TimelineEntry => ({
        kind: "event",
        at: e.occurred_at,
        event: { id: e.id, type: e.type, metadata: e.metadata },
      })
    ),
  ];

  // Oldest first, newest last — chat-style, with the composer at the bottom.
  return entries.sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );
}

/** Human-readable label for a timeline event system line. */
export function eventLabel(
  type: string,
  metadata: Record<string, unknown> | null
): string {
  switch (type) {
    case "sent":
      return "Email sent";
    case "opened":
      return "Email opened";
    case "clicked":
      return "Link clicked";
    case "bounced":
      return "Email bounced";
    case "stage_moved": {
      const to = metadata?.to;
      return typeof to === "string" && to ? `Moved to ${to}` : "Stage changed";
    }
    default:
      return type;
  }
}
