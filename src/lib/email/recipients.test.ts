import { describe, it, expect } from "vitest";
import {
  formatAddressList,
  MAX_RECIPIENTS,
  parseAddressList,
  resolveCopyList,
} from "./recipients";

describe("parseAddressList", () => {
  it("splits on commas, semicolons and newlines", () => {
    expect(parseAddressList("a@x.com, b@x.com; c@x.com\nd@x.com").addresses).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
      "d@x.com",
    ]);
  });

  it("unwraps \"Name <addr>\" pairs pasted from a mail client", () => {
    expect(
      parseAddressList("Ada Lovelace <ada@x.com>, Bob <bob@y.com>").addresses
    ).toEqual(["ada@x.com", "bob@y.com"]);
  });

  it("mixes bare addresses and named pairs", () => {
    expect(parseAddressList("Ada <ada@x.com> bob@y.com").addresses).toEqual([
      "ada@x.com",
      "bob@y.com",
    ]);
  });

  it("lowercases and dedupes", () => {
    expect(parseAddressList("Ada@X.com, ada@x.com").addresses).toEqual(["ada@x.com"]);
  });

  it("collects malformed entries instead of dropping them silently", () => {
    const r = parseAddressList("ok@x.com, not-an-email");
    expect(r.addresses).toEqual(["ok@x.com"]);
    expect(r.invalid).toEqual(["not-an-email"]);
  });

  it("returns empty for blank input", () => {
    expect(parseAddressList("   ")).toEqual({ addresses: [], invalid: [] });
    expect(parseAddressList(null)).toEqual({ addresses: [], invalid: [] });
  });
});

describe("resolveCopyList", () => {
  it("passes clean lists through", () => {
    expect(resolveCopyList("a@x.com, b@x.com", "Cc")).toEqual({
      addresses: ["a@x.com", "b@x.com"],
    });
  });

  it("errors on an invalid address, naming it", () => {
    const r = resolveCopyList("a@x.com, nope", "Cc");
    expect(r.addresses).toEqual([]);
    expect(r.error).toContain("nope");
  });

  it("errors past the recipient cap", () => {
    const many = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `a${i}@x.com`);
    expect(resolveCopyList(many.join(","), "Bcc").error).toContain("Bcc");
  });

  it("drops addresses already on the To line", () => {
    expect(
      resolveCopyList("jane@x.com, bob@x.com", "Cc", ["Jane@X.com"]).addresses
    ).toEqual(["bob@x.com"]);
  });
});

describe("formatAddressList", () => {
  it("renders a stored list back into a field value", () => {
    expect(formatAddressList(["a@x.com", "b@x.com"])).toBe("a@x.com, b@x.com");
    expect(formatAddressList(null)).toBe("");
  });
});
