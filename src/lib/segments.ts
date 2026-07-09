// Segment filter model + a pure evaluation engine shared by the builder
// (client preview), server actions (snapshot/preview), and the Inngest cron.

import { LIFECYCLE_STAGES, type LifecycleStage } from "./types";

export type SegmentType = "static" | "dynamic";

export type Operator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty";

export const OPERATOR_LABELS: Record<Operator, string> = {
  equals: "is",
  not_equals: "is not",
  contains: "contains",
  not_contains: "does not contain",
  is_empty: "is empty",
  is_not_empty: "is not empty",
};

export type FieldKind = "text" | "enum";

export type SegmentFieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  options?: readonly string[];
};

/** Filterable fields. Company fields require the company join on resolution. */
export const SEGMENT_FIELDS: SegmentFieldDef[] = [
  {
    key: "lifecycle_stage",
    label: "Lifecycle stage",
    kind: "enum",
    options: LIFECYCLE_STAGES,
  },
  { key: "source", label: "Source", kind: "text" },
  { key: "email", label: "Email", kind: "text" },
  { key: "first_name", label: "First name", kind: "text" },
  { key: "last_name", label: "Last name", kind: "text" },
  { key: "title", label: "Title", kind: "text" },
  { key: "company_name", label: "Company name", kind: "text" },
  { key: "company_city", label: "Company city", kind: "text" },
  { key: "company_industry", label: "Company industry", kind: "text" },
];

export const OPERATORS_FOR_KIND: Record<FieldKind, Operator[]> = {
  text: [
    "contains",
    "not_contains",
    "equals",
    "not_equals",
    "is_empty",
    "is_not_empty",
  ],
  enum: ["equals", "not_equals"],
};

export function fieldDef(key: string): SegmentFieldDef | undefined {
  return SEGMENT_FIELDS.find((f) => f.key === key);
}

export const VALUELESS_OPS: Operator[] = ["is_empty", "is_not_empty"];

export type Rule = { field: string; op: Operator; value?: string };

export type SegmentDefinition = {
  match: "all" | "any";
  rules: Rule[];
};

export const EMPTY_DEFINITION: SegmentDefinition = { match: "all", rules: [] };

export type Segment = {
  id: string;
  org_id: string;
  name: string;
  type: SegmentType;
  definition: SegmentDefinition;
  last_evaluated_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Shape a segment resolution query should return (contact + joined company). */
export type EvaluableContact = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  source: string | null;
  lifecycle_stage: LifecycleStage;
  companies: { name: string | null; city: string | null; industry: string | null } | null;
};

function fieldValue(c: EvaluableContact, key: string): string {
  switch (key) {
    case "lifecycle_stage":
      return c.lifecycle_stage ?? "";
    case "source":
      return c.source ?? "";
    case "email":
      return c.email ?? "";
    case "first_name":
      return c.first_name ?? "";
    case "last_name":
      return c.last_name ?? "";
    case "title":
      return c.title ?? "";
    case "company_name":
      return c.companies?.name ?? "";
    case "company_city":
      return c.companies?.city ?? "";
    case "company_industry":
      return c.companies?.industry ?? "";
    default:
      return "";
  }
}

export function evaluateRule(c: EvaluableContact, rule: Rule): boolean {
  const v = fieldValue(c, rule.field).toLowerCase();
  const target = (rule.value ?? "").toLowerCase();
  switch (rule.op) {
    case "equals":
      return v === target;
    case "not_equals":
      return v !== target;
    case "contains":
      return target !== "" && v.includes(target);
    case "not_contains":
      return target === "" || !v.includes(target);
    case "is_empty":
      return v === "";
    case "is_not_empty":
      return v !== "";
    default:
      return false;
  }
}

export function matchesDefinition(
  c: EvaluableContact,
  def: SegmentDefinition
): boolean {
  const rules = def.rules ?? [];
  if (rules.length === 0) return true; // empty filter → everyone
  return def.match === "any"
    ? rules.some((r) => evaluateRule(c, r))
    : rules.every((r) => evaluateRule(c, r));
}

export function evaluateFilter<T extends EvaluableContact>(
  contacts: T[],
  def: SegmentDefinition
): T[] {
  return contacts.filter((c) => matchesDefinition(c, def));
}

/** Validate/normalize a raw definition (e.g. parsed from a form). */
export function parseDefinition(raw: unknown): SegmentDefinition {
  if (!raw || typeof raw !== "object") return { ...EMPTY_DEFINITION };
  const obj = raw as Record<string, unknown>;
  const match = obj.match === "any" ? "any" : "all";
  const rulesRaw = Array.isArray(obj.rules) ? obj.rules : [];
  const rules: Rule[] = [];
  for (const r of rulesRaw) {
    if (!r || typeof r !== "object") continue;
    const rr = r as Record<string, unknown>;
    const field = typeof rr.field === "string" ? rr.field : "";
    const op = rr.op as Operator;
    if (!fieldDef(field)) continue;
    if (!OPERATOR_LABELS[op]) continue;
    rules.push({
      field,
      op,
      value: VALUELESS_OPS.includes(op)
        ? undefined
        : typeof rr.value === "string"
          ? rr.value
          : "",
    });
  }
  return { match, rules };
}

/** Supabase select string that yields EvaluableContact rows. */
export const EVALUABLE_SELECT =
  "id, email, first_name, last_name, title, source, lifecycle_stage, companies(name, city, industry)";
