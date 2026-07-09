import { describe, it, expect } from "vitest";
import {
  partitionResults,
  companyPayload,
  applyFilters,
  type PlaceResult,
} from "./provider";

function place(placeId: string, name = "Biz"): PlaceResult {
  return {
    placeId,
    name,
    category: "dentist",
    phone: null,
    website: "https://x.example.com",
    address: "1 Main St",
    city: "Austin",
    region: "TX",
    postalCode: null,
    rating: 4.5,
    latitude: 30.26,
    longitude: -97.74,
  };
}

describe("partitionResults", () => {
  it("keeps fresh results and counts existing as duplicates", () => {
    const { fresh, duplicates } = partitionResults(
      [place("a"), place("b"), place("c")],
      ["b"]
    );
    expect(fresh.map((r) => r.placeId)).toEqual(["a", "c"]);
    expect(duplicates).toBe(1);
  });

  it("dedupes within the same batch", () => {
    const { fresh, duplicates } = partitionResults(
      [place("a"), place("a"), place("d")],
      []
    );
    expect(fresh.map((r) => r.placeId)).toEqual(["a", "d"]);
    expect(duplicates).toBe(1);
  });

  it("treats missing placeId as a duplicate/skip", () => {
    const { fresh, duplicates } = partitionResults([place("")], []);
    expect(fresh).toHaveLength(0);
    expect(duplicates).toBe(1);
  });
});

describe("companyPayload", () => {
  it("maps a place result to a company insert with source tag", () => {
    const p = companyPayload(place("a", "Acme Dental"), "org1");
    expect(p).toMatchObject({
      org_id: "org1",
      name: "Acme Dental",
      google_place_id: "a",
      source: "google_places",
      city: "Austin",
      region: "TX",
      latitude: 30.26,
      longitude: -97.74,
    });
  });
});

describe("applyFilters", () => {
  const withRating = (id: string, rating: number | null): PlaceResult => ({
    ...place(id),
    rating,
  });

  it("filters by minimum rating", () => {
    const out = applyFilters(
      [withRating("a", 4.8), withRating("b", 3.2), withRating("c", null)],
      { minRating: 4 }
    );
    expect(out.map((r) => r.placeId)).toEqual(["a"]);
  });

  it("filters by presence of website and phone", () => {
    const noWeb: PlaceResult = { ...place("a"), website: null };
    const withPhone: PlaceResult = { ...place("b"), phone: "+1 555 0100" };
    expect(applyFilters([noWeb, withPhone], { hasWebsite: true })).toEqual([
      withPhone,
    ]);
    expect(applyFilters([noWeb, withPhone], { hasPhone: true })).toEqual([
      withPhone,
    ]);
  });

  it("returns everything when no filters set", () => {
    const all = [place("a"), place("b")];
    expect(applyFilters(all, {})).toHaveLength(2);
  });
});
