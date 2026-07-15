// PostgREST caps a single SELECT at a fixed max row count (1000 by default),
// so any query that must see *every* matching row — dedup keys, segment
// evaluation, whole-table health checks — has to page with `.range()`. These
// helpers loop until a short page signals the end.

const PAGE_SIZE = 1000;

// Loose shape so any PostgREST query response (its row type is narrower) is
// assignable — callers pin the row type via the generic on fetchAllRows.
type PageResult = { data: unknown[] | null; error: { message: string } | null };

/**
 * Fetch every row a query would return, one page at a time. `build(from, to)`
 * must apply `.range(from, to)` to the query it constructs. Throws on the first
 * page error so callers surface a real failure instead of a silent short read.
 */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<PageResult>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}
