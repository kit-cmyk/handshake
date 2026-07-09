import { describe, it, expect } from "vitest";
import { buildTimeline, eventLabel, TIMELINE_EVENT_TYPES } from "./timeline";
import type { Activity, Message } from "@/lib/types";

function msg(id: string, at: string, direction: "inbound" | "outbound"): Message {
  return {
    id,
    org_id: "o1",
    conversation_id: "cv1",
    contact_id: "c1",
    direction,
    channel: "email",
    from_address: null,
    to_address: null,
    subject: null,
    body_html: null,
    body_text: null,
    snippet: null,
    user_id: null,
    provider_message_id: null,
    campaign_id: null,
    created_at: at,
  };
}

function act(id: string, at: string): Activity {
  return {
    id,
    org_id: "o1",
    type: "note",
    contact_id: "c1",
    deal_id: null,
    body: "hi",
    due_at: null,
    done_at: null,
    user_id: "u1",
    created_at: at,
  };
}

describe("buildTimeline", () => {
  it("merges messages, activities, and events into one chronological list", () => {
    const timeline = buildTimeline({
      messages: [msg("m1", "2026-01-01T10:00:00Z", "outbound")],
      activities: [act("a1", "2026-01-01T09:00:00Z")],
      events: [
        {
          id: "e1",
          type: "opened",
          metadata: null,
          occurred_at: "2026-01-01T11:00:00Z",
        },
      ],
    });

    expect(timeline.map((t) => t.kind)).toEqual(["activity", "message", "event"]);
    expect(timeline.map((t) => t.at)).toEqual([
      "2026-01-01T09:00:00Z",
      "2026-01-01T10:00:00Z",
      "2026-01-01T11:00:00Z",
    ]);
  });

  it("orders oldest first so the newest entry sits at the bottom (chat-style)", () => {
    const timeline = buildTimeline({
      messages: [
        msg("newer", "2026-02-02T00:00:00Z", "inbound"),
        msg("older", "2026-01-01T00:00:00Z", "outbound"),
      ],
      activities: [],
      events: [],
    });
    expect(timeline[0].at).toBe("2026-01-01T00:00:00Z");
    expect(timeline[timeline.length - 1].at).toBe("2026-02-02T00:00:00Z");
  });

  it("handles all-empty input", () => {
    expect(buildTimeline({ messages: [], activities: [], events: [] })).toEqual([]);
  });
});

describe("eventLabel", () => {
  it("labels pipeline movement using metadata", () => {
    expect(eventLabel("stage_moved", { from: "New", to: "Qualified" })).toBe(
      "Moved to Qualified"
    );
    expect(eventLabel("stage_moved", null)).toBe("Stage changed");
  });

  it("labels email funnel events", () => {
    expect(eventLabel("opened", null)).toBe("Email opened");
    expect(eventLabel("clicked", null)).toBe("Link clicked");
    expect(eventLabel("sent", null)).toBe("Email sent");
    expect(eventLabel("bounced", null)).toBe("Email bounced");
  });

  it("does not surface 'replied' events (the reply body renders as a bubble)", () => {
    expect(TIMELINE_EVENT_TYPES).not.toContain("replied");
    expect(TIMELINE_EVENT_TYPES).toContain("stage_moved");
  });
});
