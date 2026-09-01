// Pure helpers for the inbox timeline: merge the three activity sources
// (messages, activities, funnel events) into one chronological stream, and
// label the events that are worth surfacing. Kept side-effect-free so it is
// unit-testable and reusable by the server component and any future callers.

import type { Activity, Message, TimelineEntry } from "@/lib/types";
import { statusLabel } from "@/lib/utils";

export type TimelineEvent = {
  id: string;
  type: string;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
};

/**
 * Event types worth showing in the timeline as system lines. `replied` is
 * intentionally excluded — the reply body now renders as an inbound message
 * bubble, so a system line would duplicate it. `sent` is kept because campaign
 * and workflow sends still record one for the funnel, but buildTimeline drops
 * the line whenever the matching message bubble is present.
 */
export const TIMELINE_EVENT_TYPES = [
  "sent",
  "opened",
  "clicked",
  "bounced",
  "stage_moved",
] as const;

/**
 * Drop the `sent` system line for any send that also has a message bubble.
 *
 * An automated send records both: a `sent` event (which the campaign funnel
 * counts) and a message row (which the thread renders). They correlate on the
 * provider's own id — `messages.provider_message_id` against the event's
 * `metadata.message_id` — so the pair collapses to the bubble. Sends from
 * before the engines recorded messages have no bubble to collapse into and keep
 * their line, which is why this filters rather than dropping `sent` outright.
 */
function withoutDuplicateSends(
  events: TimelineEvent[],
  messages: Message[]
): TimelineEvent[] {
  const delivered = new Set(
    messages
      .map((m) => m.provider_message_id)
      .filter((id): id is string => !!id)
  );
  if (!delivered.size) return events;
  return events.filter((e) => {
    if (e.type !== "sent") return true;
    const id = e.metadata?.message_id;
    return !(typeof id === "string" && delivered.has(id));
  });
}

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
    ...withoutDuplicateSends(input.events, input.messages).map(
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
      return statusLabel(type);
  }
}
