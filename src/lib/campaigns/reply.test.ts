import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { shouldStopOnReply } from "./reply";

// Minimal fake matching the query shapes shouldStopOnReply uses:
//   admin.from(table).select(cols).eq(col, val).maybeSingle()
function fakeAdmin(rows: {
  step?: { stop_on_reply: boolean | null };
  campaign?: { stop_on_reply: boolean | null };
}): SupabaseClient {
  return {
    from(table: string) {
      const data =
        table === "campaign_steps"
          ? (rows.step ?? null)
          : (rows.campaign ?? null);
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("shouldStopOnReply", () => {
  it("step override true wins over campaign default false", async () => {
    const admin = fakeAdmin({
      step: { stop_on_reply: true },
      campaign: { stop_on_reply: false },
    });
    expect(await shouldStopOnReply(admin, "c1", "s1")).toBe(true);
  });

  it("step override false wins over campaign default true", async () => {
    const admin = fakeAdmin({
      step: { stop_on_reply: false },
      campaign: { stop_on_reply: true },
    });
    expect(await shouldStopOnReply(admin, "c1", "s1")).toBe(false);
  });

  it("null step inherits the campaign default", async () => {
    expect(
      await shouldStopOnReply(
        fakeAdmin({ step: { stop_on_reply: null }, campaign: { stop_on_reply: true } }),
        "c1",
        "s1"
      )
    ).toBe(true);
    expect(
      await shouldStopOnReply(
        fakeAdmin({ step: { stop_on_reply: null }, campaign: { stop_on_reply: false } }),
        "c1",
        "s1"
      )
    ).toBe(false);
  });

  it("defaults to stop when campaign flag is unset/absent", async () => {
    expect(
      await shouldStopOnReply(fakeAdmin({ campaign: { stop_on_reply: null } }), "c1", null)
    ).toBe(true);
  });

  it("defaults to stop when there is no campaign id", async () => {
    expect(await shouldStopOnReply(fakeAdmin({}), null, null)).toBe(true);
  });
});
