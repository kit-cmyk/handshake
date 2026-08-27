import { describe, it, expect } from "vitest";
import { money, statusLabel, timeAgo } from "./utils";

describe("statusLabel", () => {
  it("capitalizes a single-word status", () => {
    expect(statusLabel("draft")).toBe("Draft");
    expect(statusLabel("unsubscribed")).toBe("Unsubscribed");
  });

  it("turns underscores into spaces, capitalizing only the first word", () => {
    expect(statusLabel("stage_moved")).toBe("Stage moved");
  });

  it("leaves an already-capitalized value alone", () => {
    expect(statusLabel("Active")).toBe("Active");
  });

  it("returns an empty string for a missing value", () => {
    expect(statusLabel(null)).toBe("");
    expect(statusLabel(undefined)).toBe("");
    expect(statusLabel("")).toBe("");
  });
});

describe("money", () => {
  it("formats whole dollars with no decimals", () => {
    expect(money(5000)).toBe("$5,000");
    expect(money(1234567)).toBe("$1,234,567");
  });

  it("rounds rather than showing cents", () => {
    expect(money(1234.56)).toBe("$1,235");
  });

  it("formats zero as a real amount, not as missing", () => {
    // A deal explicitly worth nothing is not the same as a deal with no value.
    expect(money(0)).toBe("$0");
  });

  it("returns the fallback for a missing value", () => {
    expect(money(null)).toBe("");
    expect(money(undefined)).toBe("");
    expect(money(null, "—")).toBe("—");
  });
});

describe("timeAgo", () => {
  const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

  it("reads sub-minute ages as just now", () => {
    expect(timeAgo(at(30_000))).toBe("just now");
  });

  it("steps through minutes, hours and days", () => {
    expect(timeAgo(at(5 * 60_000))).toBe("5m ago");
    expect(timeAgo(at(3 * 3_600_000))).toBe("3h ago");
    expect(timeAgo(at(2 * 86_400_000))).toBe("2d ago");
  });

  it("keeps counting in days past a week", () => {
    expect(timeAgo(at(30 * 86_400_000))).toBe("30d ago");
  });

  it("treats a future timestamp as just now rather than a negative age", () => {
    // Usually a second of clock skew between Postgres and the browser.
    expect(timeAgo(new Date(Date.now() + 5_000).toISOString())).toBe("just now");
  });

  it("returns never for a missing or unparseable value", () => {
    expect(timeAgo(null)).toBe("never");
    expect(timeAgo(undefined)).toBe("never");
    expect(timeAgo("not a date")).toBe("never");
  });
});
