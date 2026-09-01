import { describe, it, expect } from "vitest";
import { LINKEDIN_COMPANY_RE, normalizeLinkedIn } from "./linkedin";

describe("normalizeLinkedIn", () => {
  it("canonicalizes locale subdomains, query strings and trailing slashes", () => {
    const canonical = "https://www.linkedin.com/company/acme";
    for (const raw of [
      "https://www.linkedin.com/company/acme",
      "http://linkedin.com/company/acme/",
      "https://uk.linkedin.com/company/acme?trk=footer",
      "linkedin.com/company/acme",
    ]) {
      expect(normalizeLinkedIn(raw)).toBe(canonical);
    }
  });

  it("keeps personal profiles", () => {
    expect(normalizeLinkedIn("https://linkedin.com/in/jane-doe-123")).toBe(
      "https://www.linkedin.com/in/jane-doe-123"
    );
  });

  it("rejects non-LinkedIn and non-profile URLs", () => {
    expect(normalizeLinkedIn(null)).toBeNull();
    expect(normalizeLinkedIn("")).toBeNull();
    expect(normalizeLinkedIn("https://example.com/company/acme")).toBeNull();
    // Look-alike host — must not pass the hostname check.
    expect(normalizeLinkedIn("https://notlinkedin.com/company/acme")).toBeNull();
    expect(normalizeLinkedIn("https://www.linkedin.com/feed")).toBeNull();
    expect(normalizeLinkedIn("not a url")).toBeNull();
  });
});

describe("LINKEDIN_COMPANY_RE", () => {
  it("finds company pages in page markup but ignores personal profiles", () => {
    const html = `
      <a href="https://www.linkedin.com/in/some-employee">Our founder</a>
      <a href="https://uk.linkedin.com/company/acme-ltd?trk=footer">Follow us</a>
    `;
    const found = html.match(LINKEDIN_COMPANY_RE) ?? [];
    expect(found).toHaveLength(1);
    expect(normalizeLinkedIn(found[0])).toBe(
      "https://www.linkedin.com/company/acme-ltd"
    );
  });
});
