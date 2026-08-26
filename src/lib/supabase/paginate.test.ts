import { describe, it, expect } from "vitest";
import { fetchAllRows } from "./paginate";

/**
 * The contacts table's row count (and the issue banner, and the lead-source
 * list) is only as accurate as this helper: PostgREST caps a single SELECT at
 * 1000 rows, so a page that reads without paging silently reports 1000 for an
 * org with more contacts than that.
 */

const PAGE_SIZE = 1000;

/** A fake table of `total` rows that honours the requested [from, to] range. */
function table(total: number) {
  const ranges: [number, number][] = [];
  const build = (from: number, to: number) => {
    ranges.push([from, to]);
    const rows = Array.from(
      { length: Math.max(0, Math.min(to, total - 1) - from + 1) },
      (_, i) => ({ id: from + i })
    );
    return Promise.resolve({ data: rows, error: null });
  };
  return { build, ranges };
}

describe("fetchAllRows", () => {
  it("returns every row when the table is larger than one page", async () => {
    const t = table(2500);
    const rows = await fetchAllRows<{ id: number }>(t.build);

    expect(rows).toHaveLength(2500);
    // Not silently truncated at the cap — the whole point.
    expect(rows).not.toHaveLength(PAGE_SIZE);
    expect(rows[0].id).toBe(0);
    expect(rows[2499].id).toBe(2499);
  });

  it("requests contiguous, non-overlapping pages", async () => {
    const t = table(2500);
    await fetchAllRows(t.build);

    expect(t.ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("stops after a short page", async () => {
    const t = table(1500);
    await fetchAllRows(t.build);
    expect(t.ranges).toHaveLength(2);
  });

  it("handles a total that is an exact multiple of the page size", async () => {
    // The boundary case: page 2 comes back exactly full, so the loop cannot
    // tell it is done without one more (empty) read.
    const t = table(2000);
    const rows = await fetchAllRows(t.build);

    expect(rows).toHaveLength(2000);
    expect(t.ranges).toHaveLength(3);
  });

  it("returns an empty array for an empty table", async () => {
    const t = table(0);
    expect(await fetchAllRows(t.build)).toEqual([]);
    expect(t.ranges).toHaveLength(1);
  });

  it("does not page a table smaller than one page", async () => {
    const t = table(42);
    expect(await fetchAllRows(t.build)).toHaveLength(42);
    expect(t.ranges).toEqual([[0, 999]]);
  });

  it("throws on a page error rather than returning a short read", async () => {
    // A silent partial result here would undercount the table, which is worse
    // than a visible failure.
    await expect(
      fetchAllRows(() =>
        Promise.resolve({ data: null, error: { message: "timeout" } })
      )
    ).rejects.toThrow("timeout");
  });

  it("surfaces an error raised on a later page", async () => {
    let call = 0;
    await expect(
      fetchAllRows((from, to) => {
        if (call++ === 0) {
          const rows = Array.from({ length: PAGE_SIZE }, (_, i) => ({
            id: from + i,
          }));
          return Promise.resolve({ data: rows, error: null });
        }
        void to;
        return Promise.resolve({ data: null, error: { message: "gone" } });
      })
    ).rejects.toThrow("gone");
  });

  it("treats a null page as empty and stops", async () => {
    const rows = await fetchAllRows(() =>
      Promise.resolve({ data: null, error: null })
    );
    expect(rows).toEqual([]);
  });
});
