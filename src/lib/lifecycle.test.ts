import { describe, it, expect } from "vitest";
import { lifecycleForStage, targetLifecycle } from "./lifecycle";

describe("lifecycleForStage", () => {
  it("pins won/lost from the deal status regardless of stage name", () => {
    expect(lifecycleForStage("Proposal", "won")).toBe("won");
    expect(lifecycleForStage("Anything", "lost")).toBe("lost");
    expect(lifecycleForStage("New", "won")).toBe("won");
  });

  it("matches lifecycle stage names case-insensitively for open deals", () => {
    expect(lifecycleForStage("New", "open")).toBe("new");
    expect(lifecycleForStage("contacted", "open")).toBe("contacted");
    expect(lifecycleForStage("  Qualified ", "open")).toBe("qualified");
  });

  it("maps common non-lifecycle stage names to a funnel position", () => {
    expect(lifecycleForStage("Proposal", "open")).toBe("qualified");
    expect(lifecycleForStage("Negotiation", "open")).toBe("qualified");
    expect(lifecycleForStage("Lead", "open")).toBe("new");
  });

  it("returns null for unmapped stages so the contact is left untouched", () => {
    expect(lifecycleForStage("Onboarding", "open")).toBeNull();
    expect(lifecycleForStage("", "open")).toBeNull();
    expect(lifecycleForStage(null, "open")).toBeNull();
  });
});

describe("targetLifecycle", () => {
  it("prefers the stage's configured lifecycle_stage over its name", () => {
    // A stage named "Proposal" that an org has explicitly mapped to "contacted"
    // must honor the configured value, not the name-based guess (qualified).
    expect(
      targetLifecycle({ name: "Proposal", lifecycle_stage: "contacted" }, "open"),
    ).toBe("contacted");
  });

  it("falls back to name matching when no lifecycle is configured", () => {
    expect(
      targetLifecycle({ name: "Qualified", lifecycle_stage: null }, "open"),
    ).toBe("qualified");
    expect(
      targetLifecycle({ name: "Onboarding", lifecycle_stage: null }, "open"),
    ).toBeNull();
  });

  it("pins won/lost from status ahead of any stage mapping", () => {
    expect(
      targetLifecycle({ name: "Proposal", lifecycle_stage: "qualified" }, "won"),
    ).toBe("won");
    expect(targetLifecycle(null, "lost")).toBe("lost");
  });
});
