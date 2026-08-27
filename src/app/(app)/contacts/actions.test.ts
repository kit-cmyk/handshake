import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Contact deletion has one non-obvious hazard: deals reference contacts with
 * ON DELETE SET NULL, while deals_contact_or_company_chk requires a deal to
 * keep at least one of contact_id / company_id. Deleting a contact whose deal
 * has no company therefore SET-NULLs that deal into a check violation and the
 * delete aborts. Every delete path must clear those party-less deals first.
 */

type Op = { table: string; method: string; args: unknown[] };

type TableResult = { error?: { message: string } | null; count?: number };

function makeSupabase(results: Record<string, TableResult> = {}) {
  const ops: Op[] = [];

  function builder(table: string) {
    const chain: Record<string, unknown> = {};
    const record =
      (method: string) =>
      (...args: unknown[]) => {
        ops.push({ table, method, args });
        return chain;
      };
    for (const m of ["delete", "eq", "is", "in", "select", "update", "insert"]) {
      chain[m] = record(m);
    }
    // Thenable, so `await supabase.from(...)...` resolves to the stubbed result.
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve(results[table] ?? { error: null, count: 0 });
    return chain;
  }

  return {
    client: { from: (t: string) => builder(t) },
    ops,
    /** Ops for one table, in call order. */
    on: (table: string) => ops.filter((o) => o.table === table),
  };
}

let supabase: ReturnType<typeof makeSupabase>;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: vi.fn() } }));
vi.mock("@/lib/context", () => ({
  requireContext: async () => ({
    supabase: supabase.client,
    org: { id: "org-1" },
    userId: "user-1",
    userEmail: "a@b.com",
  }),
}));

const { deleteContact, bulkDeleteContacts } = await import("./actions");

beforeEach(() => {
  supabase = makeSupabase();
});

describe("deleteContact", () => {
  it("clears party-less deals before deleting the contact", async () => {
    await deleteContact("c-1");

    const deals = supabase.on("deals");
    expect(deals.map((o) => o.method)).toEqual(["delete", "eq", "is"]);
    expect(deals[1].args).toEqual(["contact_id", "c-1"]);
    // company_id IS NULL — company-linked deals must survive the contact.
    expect(deals[2].args).toEqual(["company_id", null]);

    // Order matters: deals must be cleared before the contact row goes.
    const firstContactOp = supabase.ops.findIndex((o) => o.table === "contacts");
    const lastDealOp = supabase.ops.map((o) => o.table).lastIndexOf("deals");
    expect(lastDealOp).toBeLessThan(firstContactOp);
  });

  it("deletes the contact by id", async () => {
    await deleteContact("c-1");
    const contacts = supabase.on("contacts");
    expect(contacts.map((o) => o.method)).toEqual(["delete", "eq"]);
    expect(contacts[1].args).toEqual(["id", "c-1"]);
  });

  it("reports the error when the delete fails", async () => {
    supabase = makeSupabase({ contacts: { error: { message: "boom" } } });
    expect(await deleteContact("c-1")).toEqual({ error: "boom" });
  });

  it("returns ok on success", async () => {
    expect(await deleteContact("c-1")).toEqual({ ok: true });
  });
});

describe("bulkDeleteContacts", () => {
  it("clears party-less deals for the whole batch first", async () => {
    // Regression: this path used to delete contacts directly, so any selected
    // contact holding a company-less deal aborted the entire chunk.
    await bulkDeleteContacts(["c-1", "c-2"]);

    const deals = supabase.on("deals");
    expect(deals.map((o) => o.method)).toEqual(["delete", "in", "is"]);
    expect(deals[1].args).toEqual(["contact_id", ["c-1", "c-2"]]);
    expect(deals[2].args).toEqual(["company_id", null]);

    const firstContactOp = supabase.ops.findIndex((o) => o.table === "contacts");
    const lastDealOp = supabase.ops.map((o) => o.table).lastIndexOf("deals");
    expect(lastDealOp).toBeLessThan(firstContactOp);
  });

  it("deletes every id in the batch", async () => {
    await bulkDeleteContacts(["c-1", "c-2"]);
    const contacts = supabase.on("contacts");
    expect(contacts[1].args).toEqual(["id", ["c-1", "c-2"]]);
  });

  it("reports the number actually deleted", async () => {
    supabase = makeSupabase({ contacts: { error: null, count: 2 } });
    expect(await bulkDeleteContacts(["c-1", "c-2"])).toEqual({
      ok: true,
      deleted: 2,
    });
  });

  it("short-circuits an empty batch without touching the database", async () => {
    expect(await bulkDeleteContacts([])).toEqual({ ok: true, deleted: 0 });
    expect(supabase.ops).toHaveLength(0);
  });

  it("reports the error when the delete fails", async () => {
    supabase = makeSupabase({ contacts: { error: { message: "nope" } } });
    expect(await bulkDeleteContacts(["c-1"])).toEqual({ error: "nope" });
  });
});
