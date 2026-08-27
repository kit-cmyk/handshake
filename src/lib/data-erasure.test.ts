import { describe, it, expect } from "vitest";
import { DATASETS, COUNTED_TABLES, findDataset } from "./data-erasure";

const keyOf = (k: string) => DATASETS.findIndex((d) => d.key === k);

describe("DATASETS", () => {
  it("has a unique key per dataset", () => {
    const keys = DATASETS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every dataset something to count and something to delete", () => {
    for (const d of DATASETS) {
      expect(d.countTables.length).toBeGreaterThan(0);
      expect(d.steps.length).toBeGreaterThan(0);
    }
  });

  it("clears party-less deals before deleting contacts or companies", () => {
    // deals_contact_or_company_chk aborts the delete otherwise.
    const contacts = findDataset("contacts")!;
    expect(contacts.steps.map((s) => s.table)).toEqual(["deals", "contacts"]);
    expect(contacts.steps[0].filters).toEqual([
      { column: "contact_id", isNull: false },
      { column: "company_id", isNull: true },
    ]);

    const companies = findDataset("companies")!;
    expect(companies.steps.map((s) => s.table)).toEqual(["deals", "companies"]);
    expect(companies.steps[0].filters).toEqual([
      { column: "company_id", isNull: false },
      { column: "contact_id", isNull: true },
    ]);
  });

  it("orders contacts before companies so the sweep survives the constraint", () => {
    // Deleting contacts SET-NULLs contact_id on their company-linked deals;
    // companies then has to be the step that clears those.
    expect(keyOf("contacts")).toBeLessThan(keyOf("companies"));
  });
});

describe("COUNTED_TABLES", () => {
  it("lists each counted table once", () => {
    expect(new Set(COUNTED_TABLES).size).toBe(COUNTED_TABLES.length);
    expect(COUNTED_TABLES).toEqual(
      expect.arrayContaining(DATASETS.flatMap((d) => d.countTables))
    );
  });
});

describe("findDataset", () => {
  it("resolves known keys and rejects anything else", () => {
    expect(findDataset("contacts")?.label).toBe("Contacts");
    expect(findDataset("organizations")).toBeUndefined();
    expect(findDataset("")).toBeUndefined();
  });
});
