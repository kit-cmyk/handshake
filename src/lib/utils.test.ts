import { describe, it, expect } from "vitest";
import { statusLabel } from "./utils";

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
