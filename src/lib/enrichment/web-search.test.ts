import { describe, it, expect, afterEach } from "vitest";
import {
  parseDuckDuckGoHtml,
  unwrapResultUrl,
  searchBackend,
} from "./web-search";

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("searchBackend", () => {
  it("prefers a keyed API, falls back to scraping, and can be turned off", () => {
    delete process.env.WEB_SEARCH_API_KEY;
    delete process.env.LINKEDIN_LOOKUP_SEARCH;
    expect(searchBackend()).toBe("duckduckgo");

    process.env.WEB_SEARCH_API_KEY = "key";
    expect(searchBackend()).toBe("brave");

    process.env.LINKEDIN_LOOKUP_SEARCH = "off";
    expect(searchBackend()).toBe("off");
  });
});

describe("unwrapResultUrl", () => {
  it("unwraps DuckDuckGo's redirect", () => {
    expect(
      unwrapResultUrl(
        "//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.linkedin.com%2Fcompany%2Facme&rut=x"
      )
    ).toBe("https://www.linkedin.com/company/acme");
  });

  it("passes a plain URL through", () => {
    expect(unwrapResultUrl("https://acme.co/")).toBe("https://acme.co/");
  });

  it("returns null for junk", () => {
    expect(unwrapResultUrl("")).toBeNull();
  });
});

describe("parseDuckDuckGoHtml", () => {
  const html = `
    <div class="result">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.linkedin.com%2Fcompany%2Facme">
        Acme Dental | <b>LinkedIn</b>
      </a>
    </div>
    <div class="result">
      <a class="result__a" href="https://acme.co/about">About Acme</a>
    </div>
  `;

  it("returns unwrapped links with tag-free titles", () => {
    const hits = parseDuckDuckGoHtml(html, 5);
    expect(hits).toEqual([
      { url: "https://www.linkedin.com/company/acme", title: "Acme Dental | LinkedIn" },
      { url: "https://acme.co/about", title: "About Acme" },
    ]);
  });

  it("respects the limit", () => {
    expect(parseDuckDuckGoHtml(html, 1)).toHaveLength(1);
  });

  it("returns nothing when the markup changes shape", () => {
    expect(parseDuckDuckGoHtml("<div>no results here</div>", 5)).toEqual([]);
  });
});
