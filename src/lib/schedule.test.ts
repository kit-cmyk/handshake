import { describe, it, expect } from "vitest";
import { nextSendTime, ALWAYS_ON, type SendWindow } from "./schedule";

// A weekday 9am–5pm window in US Eastern.
const ET_BUSINESS: SendWindow = {
  timezone: "America/New_York",
  startHour: 9,
  endHour: 17,
  days: [1, 2, 3, 4, 5], // Mon–Fri
};

describe("nextSendTime", () => {
  it("always-on window returns now unchanged", () => {
    const now = new Date("2026-07-15T03:00:00Z"); // a Wednesday, 3am UTC
    expect(nextSendTime(now, ALWAYS_ON).getTime()).toBe(now.getTime());
  });

  it("returns now when already inside the window", () => {
    // Wed 2026-07-15 14:00 UTC = 10:00 ET (EDT, UTC-4) — inside 9–17.
    const now = new Date("2026-07-15T14:00:00Z");
    expect(nextSendTime(now, ET_BUSINESS).getTime()).toBe(now.getTime());
  });

  it("defers a pre-window send to the window open, same day", () => {
    // Wed 2026-07-15 12:00 UTC = 08:00 ET — one hour before open.
    const now = new Date("2026-07-15T12:00:00Z");
    const next = nextSendTime(now, ET_BUSINESS);
    // 09:00 ET = 13:00 UTC in July (EDT).
    expect(next.toISOString()).toBe("2026-07-15T13:00:00.000Z");
  });

  it("defers an after-hours send to the next morning", () => {
    // Wed 2026-07-15 23:00 UTC = 19:00 ET — after 17:00 close.
    const now = new Date("2026-07-15T23:00:00Z");
    const next = nextSendTime(now, ET_BUSINESS);
    // Next open: Thu 2026-07-16 09:00 ET = 13:00 UTC.
    expect(next.toISOString()).toBe("2026-07-16T13:00:00.000Z");
  });

  it("skips the weekend to Monday", () => {
    // Sat 2026-07-18 15:00 UTC (weekend) — not an allowed day.
    const now = new Date("2026-07-18T15:00:00Z");
    const next = nextSendTime(now, ET_BUSINESS);
    // Mon 2026-07-20 09:00 ET = 13:00 UTC.
    expect(next.toISOString()).toBe("2026-07-20T13:00:00.000Z");
  });

  it("handles a UTC window with no timezone offset", () => {
    const w: SendWindow = {
      timezone: "UTC",
      startHour: 8,
      endHour: 20,
      days: [0, 1, 2, 3, 4, 5, 6],
    };
    // 06:00 UTC → defer to 08:00 UTC same day.
    expect(nextSendTime(new Date("2026-07-15T06:00:00Z"), w).toISOString()).toBe(
      "2026-07-15T08:00:00.000Z"
    );
    // 12:00 UTC → inside window, unchanged.
    const inside = new Date("2026-07-15T12:00:00Z");
    expect(nextSendTime(inside, w).getTime()).toBe(inside.getTime());
  });

  it("empty day set falls back to all days (never stalls forever)", () => {
    const w: SendWindow = { timezone: "UTC", startHour: 9, endHour: 17, days: [] };
    const now = new Date("2026-07-15T12:00:00Z"); // inside 9–17 UTC
    expect(nextSendTime(now, w).getTime()).toBe(now.getTime());
  });
});
