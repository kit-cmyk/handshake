import { describe, expect, it } from "vitest";
import {
  EMPTY_DEFINITION,
  OPERATORS_FOR_KIND,
  SEGMENT_FIELDS,
  chunk,
  describeRule,
  evaluateFilter,
  evaluateRule,
  fieldDef,
  isDefinitionValid,
  matchesDefinition,
  parseDefinition,
  ruleErrors,
  type EvaluableContact,
  type Rule,
} from "./segments";

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-15T12:00:00.000Z");

function contact(over: Partial<EvaluableContact> = {}): EvaluableContact {
  return {
    id: "c1",
    email: "ada@example.com",
    first_name: "Ada",
    last_name: "Lovelace",
    title: "Analyst",
    phone: null,
    source: "manual",
    lead_source: null,
    address: null,
    city: "Austin",
    region: "TX",
    postal_code: null,
    country: "US",
    lifecycle_stage: "qualified",
    unsubscribed_at: null,
    appointment_date: null,
    created_at: "2026-06-01T00:00:00.000Z",
    companies: { name: "Acme", city: "Dallas", industry: "Software" },
    ...over,
  };
}

const rule = (r: Rule) => r;

describe("evaluateRule — text operators", () => {
  const c = contact();

  it("matches case-insensitively", () => {
    expect(
      evaluateRule(c, rule({ field: "email", op: "contains", value: "ADA" }))
    ).toBe(true);
    expect(
      evaluateRule(c, rule({ field: "first_name", op: "equals", value: "ada" }))
    ).toBe(true);
  });

  it("treats an empty `contains` as matching nobody and `not_contains` as everybody", () => {
    // Asymmetric on purpose: a blank filter must not silently select the whole
    // book, but its negation is trivially true for everyone.
    expect(
      evaluateRule(c, rule({ field: "title", op: "contains", value: "" }))
    ).toBe(false);
    expect(
      evaluateRule(c, rule({ field: "title", op: "not_contains", value: "" }))
    ).toBe(true);
  });

  it("reads null columns as empty strings", () => {
    const blank = contact({ title: null });
    expect(evaluateRule(blank, rule({ field: "title", op: "is_empty" }))).toBe(
      true
    );
    expect(
      evaluateRule(blank, rule({ field: "title", op: "is_not_empty" }))
    ).toBe(false);
  });

  it("reads joined company fields", () => {
    expect(
      evaluateRule(
        c,
        rule({ field: "company_industry", op: "equals", value: "software" })
      )
    ).toBe(true);
    expect(
      evaluateRule(
        contact({ companies: null }),
        rule({ field: "company_name", op: "is_empty" })
      )
    ).toBe(true);
  });

  it("distinguishes the contact's city from the company's", () => {
    expect(
      evaluateRule(c, rule({ field: "city", op: "equals", value: "austin" }))
    ).toBe(true);
    expect(
      evaluateRule(
        c,
        rule({ field: "company_city", op: "equals", value: "austin" })
      )
    ).toBe(false);
  });
});

describe("evaluateRule — enum and set operators", () => {
  const c = contact();

  it("handles is_any_of / is_none_of", () => {
    expect(
      evaluateRule(
        c,
        rule({
          field: "lifecycle_stage",
          op: "is_any_of",
          values: ["new", "qualified"],
        })
      )
    ).toBe(true);
    expect(
      evaluateRule(
        c,
        rule({ field: "lifecycle_stage", op: "is_none_of", values: ["won"] })
      )
    ).toBe(true);
  });

  it("matches nothing when the set is empty", () => {
    expect(
      evaluateRule(
        c,
        rule({ field: "lifecycle_stage", op: "is_any_of", values: [] })
      )
    ).toBe(false);
  });

  it("derives subscription state from unsubscribed_at", () => {
    expect(
      evaluateRule(
        c,
        rule({ field: "subscription", op: "equals", value: "subscribed" })
      )
    ).toBe(true);
    expect(
      evaluateRule(
        contact({ unsubscribed_at: "2026-01-01T00:00:00.000Z" }),
        rule({ field: "subscription", op: "equals", value: "unsubscribed" })
      )
    ).toBe(true);
  });
});

describe("evaluateRule — date operators", () => {
  it("compares against a calendar bound", () => {
    const c = contact({ created_at: "2026-06-01T00:00:00.000Z" });
    expect(
      evaluateRule(
        c,
        rule({ field: "created_at", op: "before", value: "2026-06-10" }),
        NOW
      )
    ).toBe(true);
    expect(
      evaluateRule(
        c,
        rule({ field: "created_at", op: "after", value: "2026-06-10" }),
        NOW
      )
    ).toBe(false);
  });

  it("windows on a relative day count", () => {
    const recent = contact({ created_at: new Date(NOW - 3 * DAY).toISOString() });
    const old = contact({ created_at: new Date(NOW - 90 * DAY).toISOString() });
    const r = rule({ field: "created_at", op: "in_last_days", value: "30" });
    expect(evaluateRule(recent, r, NOW)).toBe(true);
    expect(evaluateRule(old, r, NOW)).toBe(false);
  });

  it("counts a missing date as outside the window, not inside it", () => {
    const c = contact({ appointment_date: null });
    expect(
      evaluateRule(
        c,
        rule({ field: "appointment_date", op: "in_last_days", value: "30" }),
        NOW
      )
    ).toBe(false);
    expect(
      evaluateRule(
        c,
        rule({ field: "appointment_date", op: "not_in_last_days", value: "30" }),
        NOW
      )
    ).toBe(true);
  });

  it("never matches on an unparseable bound or a non-positive day count", () => {
    const c = contact();
    expect(
      evaluateRule(
        c,
        rule({ field: "created_at", op: "before", value: "not a date" }),
        NOW
      )
    ).toBe(false);
    expect(
      evaluateRule(
        c,
        rule({ field: "created_at", op: "in_last_days", value: "0" }),
        NOW
      )
    ).toBe(false);
  });
});

describe("matchesDefinition", () => {
  const c = contact();

  it("includes everyone when there are no rules", () => {
    expect(matchesDefinition(c, EMPTY_DEFINITION)).toBe(true);
  });

  it("ANDs on `all` and ORs on `any`", () => {
    const hit = rule({ field: "city", op: "equals", value: "austin" });
    const miss = rule({ field: "city", op: "equals", value: "boston" });
    expect(matchesDefinition(c, { match: "all", rules: [hit, miss] })).toBe(
      false
    );
    expect(matchesDefinition(c, { match: "any", rules: [hit, miss] })).toBe(
      true
    );
  });

  it("filters a list without mutating it", () => {
    const list = [contact({ id: "a" }), contact({ id: "b", city: "Boston" })];
    const out = evaluateFilter(list, {
      match: "all",
      rules: [rule({ field: "city", op: "equals", value: "austin" })],
    });
    expect(out.map((c) => c.id)).toEqual(["a"]);
    expect(list).toHaveLength(2);
  });
});

describe("parseDefinition", () => {
  it("falls back to an empty definition for junk", () => {
    expect(parseDefinition(null)).toEqual(EMPTY_DEFINITION);
    expect(parseDefinition("nope")).toEqual(EMPTY_DEFINITION);
    expect(parseDefinition({ rules: "not an array" })).toEqual(EMPTY_DEFINITION);
  });

  it("drops rules naming an unknown field or operator", () => {
    const def = parseDefinition({
      match: "any",
      rules: [
        { field: "nope", op: "equals", value: "x" },
        { field: "email", op: "sounds_like", value: "x" },
        { field: "email", op: "equals", value: "x" },
      ],
    });
    expect(def.match).toBe("any");
    expect(def.rules).toEqual([{ field: "email", op: "equals", value: "x" }]);
  });

  it("drops an operator that is illegal for the field's kind", () => {
    // `contains` on an enum would evaluate as a substring match the builder can
    // neither render nor correct.
    const def = parseDefinition({
      rules: [{ field: "lifecycle_stage", op: "contains", value: "qual" }],
    });
    expect(def.rules).toEqual([]);
  });

  it("normalizes the value shape per operator", () => {
    const def = parseDefinition({
      rules: [
        { field: "email", op: "is_empty", value: "ignored" },
        { field: "lifecycle_stage", op: "is_any_of", values: ["new", "new"] },
        { field: "email", op: "equals", value: 42 },
      ],
    });
    expect(def.rules[0]).toEqual({ field: "email", op: "is_empty" });
    expect(def.rules[1]).toEqual({
      field: "lifecycle_stage",
      op: "is_any_of",
      values: ["new"],
    });
    expect(def.rules[2]).toEqual({ field: "email", op: "equals", value: "" });
  });
});

describe("ruleErrors", () => {
  it("accepts a fully-configured rule", () => {
    expect(
      ruleErrors(rule({ field: "email", op: "contains", value: "acme" }))
    ).toEqual([]);
    expect(ruleErrors(rule({ field: "email", op: "is_empty" }))).toEqual([]);
  });

  it("rejects a blank value — the trap that matches nobody or everybody", () => {
    expect(
      ruleErrors(rule({ field: "lifecycle_stage", op: "equals", value: "" }))
    ).toHaveLength(1);
    expect(
      ruleErrors(rule({ field: "lifecycle_stage", op: "not_equals", value: " " }))
    ).toHaveLength(1);
  });

  it("rejects an empty set, a bad day count and a bad date", () => {
    expect(
      ruleErrors(rule({ field: "lifecycle_stage", op: "is_any_of", values: [] }))
    ).toHaveLength(1);
    expect(
      ruleErrors(rule({ field: "created_at", op: "in_last_days", value: "-2" }))
    ).toHaveLength(1);
    expect(
      ruleErrors(rule({ field: "created_at", op: "in_last_days", value: "1.5" }))
    ).toHaveLength(1);
    expect(
      ruleErrors(rule({ field: "created_at", op: "before", value: "soon" }))
    ).toHaveLength(1);
  });

  it("rejects an unknown field and a kind-mismatched operator", () => {
    expect(ruleErrors(rule({ field: "nope", op: "equals", value: "x" }))).toEqual(
      ["Pick a field."]
    );
    expect(
      ruleErrors(rule({ field: "created_at", op: "contains", value: "x" }))
    ).toHaveLength(1);
  });

  it("drives isDefinitionValid", () => {
    expect(
      isDefinitionValid({
        match: "all",
        rules: [rule({ field: "email", op: "contains", value: "a" })],
      })
    ).toBe(true);
    expect(
      isDefinitionValid({
        match: "all",
        rules: [rule({ field: "email", op: "contains", value: "" })],
      })
    ).toBe(false);
    // No rules at all is a valid (if very broad) definition.
    expect(isDefinitionValid(EMPTY_DEFINITION)).toBe(true);
  });
});

describe("describeRule", () => {
  it("reads as a sentence for every value shape", () => {
    expect(describeRule(rule({ field: "email", op: "is_empty" }))).toBe(
      "Email is empty"
    );
    expect(
      describeRule(
        rule({ field: "lifecycle_stage", op: "is_any_of", values: ["new", "won"] })
      )
    ).toBe("Lifecycle stage is any of new, won");
    expect(
      describeRule(rule({ field: "created_at", op: "in_last_days", value: "30" }))
    ).toBe("Created is in the last 30 days");
    expect(
      describeRule(rule({ field: "city", op: "equals", value: "Austin" }))
    ).toBe("City is Austin");
  });
});

describe("field catalogue", () => {
  it("has a unique key per field, resolvable via fieldDef", () => {
    const keys = SEGMENT_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(fieldDef(k)?.key).toBe(k);
  });

  it("gives every field at least one legal operator", () => {
    for (const f of SEGMENT_FIELDS)
      expect(OPERATORS_FOR_KIND[f.kind].length).toBeGreaterThan(0);
  });

  it("gives every enum field its options", () => {
    for (const f of SEGMENT_FIELDS.filter((f) => f.kind === "enum"))
      expect(f.options?.length).toBeGreaterThan(0);
  });

  it("evaluates every field key to a string rather than falling through", () => {
    // A field in the catalogue with no case in fieldValue would silently read
    // as "" and quietly match every is_empty rule.
    const c = contact();
    for (const f of SEGMENT_FIELDS) {
      const empty = evaluateRule(c, rule({ field: f.key, op: "is_empty" }));
      const notEmpty = evaluateRule(c, rule({ field: f.key, op: "is_not_empty" }));
      expect(empty).toBe(!notEmpty);
    }
  });
});

describe("chunk", () => {
  it("splits into fixed-size batches, remainder last", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 500)).toEqual([]);
  });
});
