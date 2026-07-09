// Pluggable calendar booking. Real Google Calendar event creation requires an
// OAuth access token with the Calendar scope. Until per-user OAuth is wired
// (see TODO.md), no token is present and booking is recorded in-app only.
//
// When GOOGLE_CALENDAR_ACCESS_TOKEN is available (env for now; per-user OAuth
// later), events are created on the user's primary calendar.

export type CalendarEvent = {
  summary: string;
  description?: string | null;
  /** ISO 8601 start / end. */
  startISO: string;
  endISO: string;
  attendees?: string[];
};

export type CalendarResult = { id: string; htmlLink?: string } | null;

export interface CalendarProvider {
  readonly name: string;
  readonly connected: boolean;
  createEvent(e: CalendarEvent): Promise<CalendarResult>;
}

class GoogleCalendarProvider implements CalendarProvider {
  readonly name = "google";
  readonly connected = true;
  constructor(private accessToken: string) {}

  async createEvent(e: CalendarEvent): Promise<CalendarResult> {
    try {
      const res = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summary: e.summary,
            description: e.description ?? undefined,
            start: { dateTime: e.startISO },
            end: { dateTime: e.endISO },
            attendees: e.attendees?.map((email) => ({ email })),
          }),
        }
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { id?: string; htmlLink?: string };
      return data.id ? { id: data.id, htmlLink: data.htmlLink } : null;
    } catch {
      return null;
    }
  }
}

class NoopCalendarProvider implements CalendarProvider {
  readonly name = "none";
  readonly connected = false;
  async createEvent(): Promise<CalendarResult> {
    return null;
  }
}

export function getCalendarProvider(): CalendarProvider {
  const token = process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
  return token ? new GoogleCalendarProvider(token) : new NoopCalendarProvider();
}
