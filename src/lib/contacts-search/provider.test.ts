import { describe, it, expect } from "vitest";
import {
  applyContactFilters,
  partitionContacts,
  contactPayload,
  getContactsProvider,
  type ContactResult,
} from "./provider";

function contact(
  externalId: string,
  overrides: Partial<ContactResult> = {}
): ContactResult {
  return {
    externalId,
    firstName: "Alex",
    lastName: "Nguyen",
    title: "VP Sales",
    email: `${externalId}@acme.example.com`,
    phone: "+1 555 0200",
    companyName: "Acme",
    domain: "acme.example.com",
    city: "Austin",
    region: "TX",
    linkedinUrl: "https://www.linkedin.com/in/alex",
    ...overrides,
  };
}

describe("applyContactFilters", () => {
  it("filters by presence of email", () => {
    const withEmail = contact("a");
    const noEmail = contact("b", { email: null });
    expect(applyContactFilters([withEmail, noEmail], { hasEmail: true })).toEqual(
      [withEmail]
    );
  });

  it("returns everything when no filters set", () => {
    expect(applyContactFilters([contact("a"), contact("b")], {})).toHaveLength(2);
  });
});

describe("partitionContacts", () => {
  it("keeps fresh results and counts existing (by externalId) as duplicates", () => {
    const { fresh, duplicates } = partitionContacts(
      [contact("a"), contact("b"), contact("c")],
      ["b"]
    );
    expect(fresh.map((r) => r.externalId)).toEqual(["a", "c"]);
    expect(duplicates).toBe(1);
  });

  it("dedupes against existing emails, case-insensitively", () => {
    const { fresh, duplicates } = partitionContacts(
      [contact("a", { email: "Dup@Acme.example.com" })],
      ["dup@acme.example.com"]
    );
    expect(fresh).toHaveLength(0);
    expect(duplicates).toBe(1);
  });

  it("dedupes within the same batch by email", () => {
    const { fresh, duplicates } = partitionContacts(
      [contact("a", { email: "same@x.com" }), contact("b", { email: "same@x.com" })],
      []
    );
    expect(fresh.map((r) => r.externalId)).toEqual(["a"]);
    expect(duplicates).toBe(1);
  });

  it("treats missing externalId as a duplicate/skip", () => {
    const { fresh, duplicates } = partitionContacts([contact("")], []);
    expect(fresh).toHaveLength(0);
    expect(duplicates).toBe(1);
  });
});

describe("contactPayload", () => {
  it("maps a contact result to a contacts insert with source tag", () => {
    const p = contactPayload(contact("a"), "org1", "user1", "co1");
    expect(p).toMatchObject({
      org_id: "org1",
      company_id: "co1",
      owner_id: "user1",
      first_name: "Alex",
      last_name: "Nguyen",
      title: "VP Sales",
      lifecycle_stage: "new",
      source: "people_search",
    });
  });
});

describe("MockContactsProvider", () => {
  it("returns deterministic, requested-size results with emails", async () => {
    const provider = getContactsProvider();
    const a = await provider.search({ title: "Owner", company: "Acme", limit: 5 });
    const b = await provider.search({ title: "Owner", company: "Acme", limit: 5 });
    expect(a).toHaveLength(5);
    expect(a).toEqual(b); // deterministic
    expect(a.every((r) => r.email?.includes("@"))).toBe(true);
  });
});
