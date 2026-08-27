import { describe, it, expect } from "vitest";
import {
  DEFAULT_COMPANY_CATEGORIES,
  mergeCompanyCategories,
} from "./company-categories";

describe("mergeCompanyCategories", () => {
  it("offers the built-ins when the org has saved nothing", () => {
    expect(mergeCompanyCategories([])).toEqual(
      [...DEFAULT_COMPANY_CATEGORIES].sort((a, b) => a.localeCompare(b))
    );
  });

  it("adds the org's own categories alongside the built-ins", () => {
    const out = mergeCompanyCategories(["Drone surveying"]);
    expect(out).toContain("Drone surveying");
    expect(out).toContain("Dentist");
    expect(out.length).toBe(DEFAULT_COMPANY_CATEGORIES.length + 1);
  });

  it("folds a differently-cased duplicate into the built-in spelling", () => {
    const out = mergeCompanyCategories(["dentist", "DENTIST"]);
    expect(out.filter((c) => c.toLowerCase() === "dentist")).toEqual([
      "Dentist",
    ]);
  });

  it("drops blank and whitespace-only values, and trims the rest", () => {
    const out = mergeCompanyCategories(["", "   ", "  Bike shop  "]);
    expect(out).toContain("Bike shop");
    expect(out.length).toBe(DEFAULT_COMPANY_CATEGORIES.length + 1);
  });

  it("returns a sorted list", () => {
    const out = mergeCompanyCategories(["Zeppelin repair", "Abattoir"]);
    expect(out).toEqual([...out].sort((a, b) => a.localeCompare(b)));
  });

  it("has no case-insensitive duplicates in the built-in list itself", () => {
    const slugs = DEFAULT_COMPANY_CATEGORIES.map((c) => c.toLowerCase());
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
