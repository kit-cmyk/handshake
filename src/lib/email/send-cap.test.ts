import { describe, it, expect } from "vitest";
import { minutesUntilCounterReset, reserveSendSlot } from "./send-cap";
import {
  dailyLimitCeiling,
  defaultDailyLimit,
  isPersonalAccount,
} from "./mailbox-providers";

describe("minutesUntilCounterReset", () => {
  it("counts the whole day from midnight UTC", () => {
    expect(minutesUntilCounterReset(new Date("2026-09-01T00:00:00Z"))).toBe(24 * 60);
  });

  it("counts the remainder mid-day", () => {
    expect(minutesUntilCounterReset(new Date("2026-09-01T23:00:00Z"))).toBe(60);
  });

  it("never returns zero — a 0m sleep would spin the retry loop", () => {
    expect(minutesUntilCounterReset(new Date("2026-09-01T23:59:59Z"))).toBe(1);
  });
});

describe("reserveSendSlot", () => {
  const db = (result: { data?: unknown; error?: unknown }) =>
    ({ rpc: async () => result }) as never;

  it("passes through the RPC's verdict", async () => {
    expect(await reserveSendSlot(db({ data: true }), cap(500))).toBe(true);
    expect(await reserveSendSlot(db({ data: false }), cap(500))).toBe(false);
  });

  it("fails open when the counter errors — a cap must not withhold mail", async () => {
    expect(await reserveSendSlot(db({ error: { message: "boom" } }), cap(500))).toBe(true);
  });

  it("treats a non-positive limit as uncapped without touching the counter", async () => {
    const never = { rpc: async () => { throw new Error("should not be called"); } } as never;
    expect(await reserveSendSlot(never, cap(0))).toBe(true);
  });

  const cap = (limit: number) => ({ orgId: "o", mailboxId: "m", limit });
});

describe("provider quotas", () => {
  it("recognises a free account by its domain", () => {
    expect(isPersonalAccount("gmail", "kit@gmail.com")).toBe(true);
    expect(isPersonalAccount("gmail", "kit@assembledsystems.com")).toBe(false);
    expect(isPersonalAccount("outlook", "kit@hotmail.com")).toBe(true);
  });

  it("is case-insensitive about the domain", () => {
    expect(isPersonalAccount("gmail", "Kit@GMAIL.com")).toBe(true);
  });

  it("ceilings a free Gmail lower than a Workspace one", () => {
    expect(dailyLimitCeiling("gmail", "kit@gmail.com")).toBe(500);
    expect(dailyLimitCeiling("gmail", "kit@assembledsystems.com")).toBe(2000);
  });

  it("defaults below the ceiling, leaving headroom for manual replies", () => {
    for (const email of ["kit@gmail.com", "kit@assembledsystems.com"]) {
      expect(defaultDailyLimit("gmail", email)).toBeLessThan(
        dailyLimitCeiling("gmail", email)
      );
    }
    expect(defaultDailyLimit("gmail", "kit@gmail.com")).toBe(400);
  });
});
