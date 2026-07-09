import { describe, it, expect } from "vitest";
import {
  openToken,
  clickToken,
  verifyToken,
  replyAddress,
  replyToken,
  verifyReplyToken,
  tokenFromReplyAddress,
  withOpenPixel,
  withClickTracking,
  type TrackContext,
} from "./tracking";

const ctx: TrackContext = {
  orgId: "org-1",
  contactId: "contact-1",
  campaignId: "camp-1",
  stepId: "step-1",
};

describe("tracking tokens", () => {
  it("round-trips an open token", () => {
    const t = verifyToken(openToken(ctx));
    expect(t).toMatchObject({ ...ctx, url: null });
  });

  it("carries the destination url in a click token", () => {
    const t = verifyToken(clickToken(ctx, "https://example.com/x?y=1"));
    expect(t?.url).toBe("https://example.com/x?y=1");
    expect(t?.contactId).toBe("contact-1");
  });

  it("rejects a tampered token", () => {
    const tok = openToken(ctx);
    const [body] = tok.split(".");
    expect(verifyToken(`${body}.deadbeefdeadbeef`)).toBeNull();
  });

  it("rejects a payload with a swapped body but reused signature", () => {
    const a = openToken(ctx);
    const b = openToken({ ...ctx, contactId: "attacker" });
    const forged = `${b.split(".")[0]}.${a.split(".")[1]}`;
    expect(verifyToken(forged)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyToken("")).toBeNull();
    expect(verifyToken("nodot")).toBeNull();
    expect(verifyToken(".onlysig")).toBeNull();
  });
});

describe("reply routing", () => {
  it("embeds and recovers the enrollment id via the reply address", () => {
    const addr = replyAddress(ctx, "enr-9");
    const token = tokenFromReplyAddress(addr);
    expect(token).toBeTruthy();
    const r = verifyReplyToken(token!);
    expect(r?.enrollmentId).toBe("enr-9");
    expect(r?.campaignId).toBe("camp-1");
  });

  it("verifyReplyToken rejects a plain (no-enrollment) token", () => {
    expect(verifyReplyToken(openToken(ctx))).toBeNull();
  });

  it("verifyReplyToken accepts a direct reply token", () => {
    expect(verifyReplyToken(replyToken(ctx, "enr-1"))?.enrollmentId).toBe("enr-1");
  });
});

describe("html rewriting", () => {
  it("appends an open pixel pointing at the track route", () => {
    const html = withOpenPixel("<p>hi</p>", ctx);
    expect(html).toContain("/api/track/open/");
    expect(html).toContain("<img");
  });

  it("rewrites body links to the click route", () => {
    const html = withClickTracking('<a href="https://acme.com">x</a>', ctx);
    expect(html).toContain("/api/track/click/");
    expect(html).not.toContain('href="https://acme.com"');
  });

  it("leaves relative and mailto links untouched", () => {
    const html = withClickTracking(
      '<a href="/local">a</a><a href="mailto:x@y.com">b</a>',
      ctx
    );
    expect(html).toContain('href="/local"');
    expect(html).toContain('href="mailto:x@y.com"');
  });
});
