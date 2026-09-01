import { describe, it, expect } from "vitest";
import {
  crawlCandidates,
  guessedPaths,
  extractProfileLinks,
  matchesPerson,
  companySearchQuery,
  personSearchQuery,
  firstLinkedInHit,
} from "./linkedin-lookup";

describe("crawlCandidates", () => {
  const html = `
    <a href="/about-us">About us</a>
    <a href="/services">Services</a>
    <a href="https://acme.co/contact">Get in touch</a>
    <a href="https://directory.example.com/about">About this directory</a>
    <a href="/about-us#top">About us again</a>
    <a href="mailto:hi@acme.co">Contact by email</a>
  `;

  it("follows same-site about/contact links, matched by href or link text", () => {
    const found = crawlCandidates(html, "https://acme.co");
    expect(found).toContain("https://acme.co/about-us");
    expect(found).toContain("https://acme.co/contact");
    expect(found).not.toContain("https://acme.co/services");
  });

  it("stays on the same site and skips non-http links", () => {
    const found = crawlCandidates(html, "https://acme.co");
    expect(found.some((u) => u.includes("directory.example.com"))).toBe(false);
    expect(found.some((u) => u.startsWith("mailto:"))).toBe(false);
  });

  it("dedupes links that differ only by fragment", () => {
    const found = crawlCandidates(html, "https://acme.co");
    expect(found.filter((u) => u === "https://acme.co/about-us")).toHaveLength(1);
  });

  it("treats www and bare host as the same site", () => {
    const found = crawlCandidates(
      '<a href="https://www.acme.co/about">About</a>',
      "https://acme.co"
    );
    expect(found).toEqual(["https://www.acme.co/about"]);
  });
});

describe("guessedPaths", () => {
  it("builds absolute URLs, tolerating a scheme-less website", () => {
    expect(guessedPaths("acme.co")).toContain("https://acme.co/about");
  });

  it("returns nothing for junk", () => {
    expect(guessedPaths("not a url")).toEqual([]);
  });
});

describe("extractProfileLinks / matchesPerson", () => {
  const team = `
    <div><h3>Jane Doe</h3>
      <a href="https://www.linkedin.com/in/jane-doe-crm">LinkedIn</a></div>
    <div><h3>Sam Patel</h3>
      <a href="//linkedin.com/in/sampatel">Sam Patel on LinkedIn</a></div>
    <a href="https://www.linkedin.com/company/acme">Acme on LinkedIn</a>
  `;

  it("collects personal profiles only, normalized", () => {
    const links = extractProfileLinks(team);
    expect(links.map((l) => l.url)).toEqual([
      "https://www.linkedin.com/in/jane-doe-crm",
      "https://www.linkedin.com/in/sampatel",
    ]);
  });

  it("matches a person by their slug", () => {
    const [jane] = extractProfileLinks(team);
    expect(matchesPerson(jane, "Jane", "Doe")).toBe(true);
  });

  it("matches a person by the anchor text when the slug is run together", () => {
    const sam = extractProfileLinks(team)[1];
    expect(matchesPerson(sam, "Sam", "Patel")).toBe(true);
  });

  it("refuses a colleague's profile", () => {
    const [jane] = extractProfileLinks(team);
    // Would otherwise write a stranger's profile onto the contact.
    expect(matchesPerson(jane, "Sam", "Patel")).toBe(false);
  });

  it("refuses a half-match and an unnamed contact", () => {
    const [jane] = extractProfileLinks(team);
    expect(matchesPerson(jane, "Jane", "Smith")).toBe(false);
    expect(matchesPerson(jane, "Jane", null)).toBe(false);
  });

  it("ignores accents when matching", () => {
    const link = {
      url: "https://www.linkedin.com/in/jose-muller",
      text: "José Müller",
    };
    expect(matchesPerson(link, "José", "Müller")).toBe(true);
  });
});

describe("search queries", () => {
  it("scopes the company query to LinkedIn company pages", () => {
    expect(companySearchQuery("Acme Dental", "Austin, TX")).toBe(
      '"Acme Dental" Austin, TX site:linkedin.com/company'
    );
  });

  it("omits a missing place", () => {
    expect(companySearchQuery("Acme Dental", null)).toBe(
      '"Acme Dental" site:linkedin.com/company'
    );
  });

  it("scopes the person query to LinkedIn profiles", () => {
    expect(personSearchQuery("Jane Doe", "Acme Dental")).toBe(
      '"Jane Doe" "Acme Dental" site:linkedin.com/in'
    );
  });
});

describe("firstLinkedInHit", () => {
  it("skips non-LinkedIn results and picks the right kind", () => {
    const hits = [
      { url: "https://acme.co/team" },
      { url: "https://www.linkedin.com/in/someone" },
      { url: "https://uk.linkedin.com/company/acme?trk=x" },
    ];
    expect(firstLinkedInHit(hits, "company")).toBe(
      "https://www.linkedin.com/company/acme"
    );
    expect(firstLinkedInHit(hits, "in")).toBe(
      "https://www.linkedin.com/in/someone"
    );
  });

  it("returns null when nothing matches", () => {
    expect(firstLinkedInHit([{ url: "https://acme.co" }], "company")).toBeNull();
  });
});
