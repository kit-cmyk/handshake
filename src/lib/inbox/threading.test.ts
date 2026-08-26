import { describe, it, expect } from "vitest";
import {
  buildThreadHeaders,
  newMessageId,
  normalizeMessageId,
  parseReferences,
  replySubject,
  threadHeaderFields,
} from "./threading";

describe("newMessageId", () => {
  it("uses the sender's domain", () => {
    expect(newMessageId("Ada <ada@acme.com>")).toMatch(/^[0-9a-f-]{36}@acme\.com$/);
  });

  it("falls back to a local domain for a malformed address", () => {
    expect(newMessageId("not-an-address")).toMatch(/@handshake\.local$/);
  });

  it("is unique per call", () => {
    expect(newMessageId("a@b.com")).not.toBe(newMessageId("a@b.com"));
  });
});

describe("normalizeMessageId", () => {
  it("strips angle brackets and whitespace", () => {
    expect(normalizeMessageId("  <abc@acme.com> ")).toBe("abc@acme.com");
  });

  it("returns null for empty input", () => {
    expect(normalizeMessageId(" <> ")).toBeNull();
    expect(normalizeMessageId(null)).toBeNull();
  });
});

describe("parseReferences", () => {
  it("parses a space-separated chain", () => {
    expect(parseReferences("<a@x> <b@x>\r\n <c@x>")).toEqual(["a@x", "b@x", "c@x"]);
  });

  it("tolerates a bracket-less, comma-separated list", () => {
    expect(parseReferences("a@x, b@x")).toEqual(["a@x", "b@x"]);
  });

  it("returns an empty chain for no header", () => {
    expect(parseReferences(undefined)).toEqual([]);
  });
});

describe("buildThreadHeaders", () => {
  it("has no parent for the first message in a thread", () => {
    const t = buildThreadHeaders("new@x", []);
    expect(t).toEqual({ messageId: "new@x", inReplyTo: null, references: [] });
    expect(threadHeaderFields(t)).toEqual({ "Message-ID": "<new@x>" });
  });

  it("replies to the newest prior id and keeps the chain", () => {
    const t = buildThreadHeaders("new@x", ["<a@x>", "b@x"]);
    expect(t.inReplyTo).toBe("b@x");
    expect(t.references).toEqual(["a@x", "b@x"]);
    expect(threadHeaderFields(t)).toEqual({
      "Message-ID": "<new@x>",
      "In-Reply-To": "<b@x>",
      References: "<a@x> <b@x>",
    });
  });

  it("skips messages that have no stored id", () => {
    const t = buildThreadHeaders("new@x", [null, "a@x", undefined]);
    expect(t.inReplyTo).toBe("a@x");
    expect(t.references).toEqual(["a@x"]);
  });

  it("caps the References chain at the 20 newest ids", () => {
    const prior = Array.from({ length: 30 }, (_, i) => `m${i}@x`);
    const t = buildThreadHeaders("new@x", prior);
    expect(t.references).toHaveLength(20);
    expect(t.references[0]).toBe("m10@x");
    expect(t.inReplyTo).toBe("m29@x");
  });
});

describe("replySubject", () => {
  it("prefixes the thread subject once", () => {
    expect(replySubject("Pricing question")).toBe("Re: Pricing question");
  });

  it("does not stack prefixes", () => {
    expect(replySubject("Re: Pricing question")).toBe("Re: Pricing question");
    expect(replySubject("RE:Pricing question")).toBe("RE:Pricing question");
  });

  it("returns empty for a thread with no subject", () => {
    expect(replySubject(null)).toBe("");
  });
});
