// Per-org send scheduling. Given an org's timezone + allowed daily window and
// weekdays, compute when the next send may go out. Pure (no Date.now, no DB) so
// it's deterministic and unit-testable — callers pass `now`.

export type SendWindow = {
  /** IANA timezone, e.g. "America/New_York". */
  timezone: string;
  /** First allowed local hour, 0–23 (inclusive). */
  startHour: number;
  /** End of the window, 1–24 (exclusive). 24 = midnight. */
  endHour: number;
  /** Allowed weekdays, 0=Sunday … 6=Saturday. */
  days: number[];
};

export const ALWAYS_ON: SendWindow = {
  timezone: "UTC",
  startHour: 0,
  endHour: 24,
  days: [0, 1, 2, 3, 4, 5, 6],
};

function isAlwaysOn(w: SendWindow): boolean {
  return w.startHour <= 0 && w.endHour >= 24 && w.days.length === 7;
}

/** Offset (ms) to add to a UTC instant to read it as wall-clock time in `tz`. */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const m: Record<string, number> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") m[p.type] = Number(p.value);
  }
  const asUTC = Date.UTC(m.year, m.month - 1, m.day, m.hour, m.minute, m.second);
  return asUTC - date.getTime();
}

/** The UTC instant for a wall-clock time in `tz` (DST-aware, one refinement). */
function zonedToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  tz: string
): Date {
  const ts = Date.UTC(y, mo, d, h, 0, 0);
  const off1 = tzOffsetMs(new Date(ts), tz);
  let utc = ts - off1;
  const off2 = tzOffsetMs(new Date(utc), tz);
  if (off2 !== off1) utc = ts - off2;
  return new Date(utc);
}

/** The UTC instant of the most recent local midnight in `tz` (for day counts). */
export function localDayStartUtc(now: Date, tz: string): Date {
  const local = new Date(now.getTime() + tzOffsetMs(now, tz));
  return zonedToUtc(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    0,
    tz
  );
}

/**
 * The next instant at or after `now` when a send is permitted by the window.
 * Returns `now` when already inside the window (or the window is always-on).
 */
export function nextSendTime(now: Date, w: SendWindow): Date {
  const days = w.days && w.days.length ? w.days : ALWAYS_ON.days;
  if (isAlwaysOn(w)) return now;

  const local = new Date(now.getTime() + tzOffsetMs(now, w.timezone));
  const y = local.getUTCFullYear();
  const mo = local.getUTCMonth();
  const d = local.getUTCDate();
  const hr = local.getUTCHours();
  const dow = local.getUTCDay();

  if (days.includes(dow) && hr >= w.startHour && hr < w.endHour) return now;

  // Walk forward up to a week to the next allowed weekday's window open.
  for (let i = 0; i < 8; i++) {
    const base = new Date(Date.UTC(y, mo, d));
    base.setUTCDate(base.getUTCDate() + i);
    if (!days.includes(base.getUTCDay())) continue;
    if (i === 0) {
      // Today: only usable if we're still before the window opens.
      if (hr < w.startHour) {
        return zonedToUtc(y, mo, d, w.startHour, w.timezone);
      }
      continue; // past today's window — keep searching
    }
    return zonedToUtc(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      base.getUTCDate(),
      w.startHour,
      w.timezone
    );
  }
  return now; // no allowed day found (shouldn't happen with a non-empty set)
}
