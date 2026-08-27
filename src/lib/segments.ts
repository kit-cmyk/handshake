// Segment filter model + a pure evaluation engine shared by the builder
// (client preview), server actions (snapshot/preview), the workflow branch
// evaluator, and the Inngest cron.

import type { SupabaseClient } from "@supabase/supabase-js";
import { LIFECYCLE_STAGES, type LifecycleStage } from "./types";

export type SegmentType = "static" | "dynamic";

export type Operator =
  | "equals"
  | "not_equals"
  | "is_any_of"
  | "is_none_of"
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty"
  | "before"
  | "after"
  | "in_last_days"
  | "not_in_last_days";

export const OPERATOR_LABELS: Record<Operator, string> = {
  equals: "is",
  not_equals: "is not",
  is_any_of: "is any of",
  is_none_of: "is none of",
  contains: "contains",
  not_contains: "does not contain",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  before: "is before",
  after: "is after",
  in_last_days: "is in the last",
  not_in_last_days: "is not in the last",
};

export type FieldKind = "text" | "enum" | "date";

export type SegmentFieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  options?: readonly string[];
  /** Grouping shown in the field picker. */
  group: "Contact" | "Address" | "Company" | "Dates";
};

const SUBSCRIPTION_OPTIONS = ["subscribed", "unsubscribed"] as const;

/** Filterable fields. Company fields require the company join on resolution. */
export const SEGMENT_FIELDS: SegmentFieldDef[] = [
  {
    key: "lifecycle_stage",
    label: "Lifecycle stage",
    kind: "enum",
    options: LIFECYCLE_STAGES,
    group: "Contact",
  },
  {
    key: "subscription",
    label: "Email subscription",
    kind: "enum",
    options: SUBSCRIPTION_OPTIONS,
    group: "Contact",
  },
  { key: "email", label: "Email", kind: "text", group: "Contact" },
  { key: "first_name", label: "First name", kind: "text", group: "Contact" },
  { key: "last_name", label: "Last name", kind: "text", group: "Contact" },
  { key: "title", label: "Title", kind: "text", group: "Contact" },
  { key: "phone", label: "Phone", kind: "text", group: "Contact" },
  { key: "source", label: "Source", kind: "text", group: "Contact" },
  { key: "lead_source", label: "Lead source", kind: "text", group: "Contact" },
  { key: "address", label: "Street address", kind: "text", group: "Address" },
  { key: "city", label: "City", kind: "text", group: "Address" },
  { key: "region", label: "State / region", kind: "text", group: "Address" },
  { key: "postal_code", label: "Postal code", kind: "text", group: "Address" },
  { key: "country", label: "Country", kind: "text", group: "Address" },
  { key: "company_name", label: "Company name", kind: "text", group: "Company" },
  { key: "company_city", label: "Company city", kind: "text", group: "Company" },
  {
    key: "company_industry",
    label: "Company industry",
    kind: "text",
    group: "Company",
  },
  { key: "created_at", label: "Created", kind: "date", group: "Dates" },
  {
    key: "appointment_date",
    label: "Appointment date",
    kind: "date",
    group: "Dates",
  },
];

/** Field-picker groups, in display order, with their fields. */
export const SEGMENT_FIELD_GROUPS: {
  group: SegmentFieldDef["group"];
  fields: SegmentFieldDef[];
}[] = (["Contact", "Address", "Company", "Dates"] as const).map((group) => ({
  group,
  fields: SEGMENT_FIELDS.filter((f) => f.group === group),
}));

export const OPERATORS_FOR_KIND: Record<FieldKind, Operator[]> = {
  text: [
    "contains",
    "not_contains",
    "equals",
    "not_equals",
    "is_empty",
    "is_not_empty",
  ],
  enum: ["equals", "not_equals", "is_any_of", "is_none_of"],
  date: [
    "in_last_days",
    "not_in_last_days",
    "before",
    "after",
    "is_empty",
    "is_not_empty",
  ],
};

export function fieldDef(key: string): SegmentFieldDef | undefined {
  return SEGMENT_FIELDS.find((f) => f.key === key);
}

/** Operators that carry no value at all. */
export const VALUELESS_OPS: Operator[] = ["is_empty", "is_not_empty"];

/** Operators whose value is a *set*, held in `rule.values`. */
export const MULTI_VALUE_OPS: Operator[] = ["is_any_of", "is_none_of"];

/** Operators whose value is a whole number of days. */
export const DAY_COUNT_OPS: Operator[] = ["in_last_days", "not_in_last_days"];

/** Operators whose value is a calendar date (YYYY-MM-DD). */
export const DATE_OPS: Operator[] = ["before", "after"];

export type Rule = {
  field: string;
  op: Operator;
  /** Single-value operators. */
  value?: string;
  /** Set operators (`is_any_of` / `is_none_of`). */
  values?: string[];
};

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
  /**
   * App-managed segments back a campaign's hand-picked / imported audience.
   * They're hidden from the segments UI and every segment picker, so users
   * never edit or delete a list a live campaign is sending against.
   */
  managed: boolean;
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
  phone: string | null;
  source: string | null;
  lead_source: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  lifecycle_stage: LifecycleStage;
  unsubscribed_at: string | null;
  appointment_date: string | null;
  created_at: string;
  companies: { name: string | null; city: string | null; industry: string | null } | null;
};

function fieldValue(c: EvaluableContact, key: string): string {
  switch (key) {
    case "lifecycle_stage":
      return c.lifecycle_stage ?? "";
    case "subscription":
      return c.unsubscribed_at ? "unsubscribed" : "subscribed";
    case "source":
      return c.source ?? "";
    case "lead_source":
      return c.lead_source ?? "";
    case "email":
      return c.email ?? "";
    case "first_name":
      return c.first_name ?? "";
    case "last_name":
      return c.last_name ?? "";
    case "title":
      return c.title ?? "";
    case "phone":
      return c.phone ?? "";
    case "address":
      return c.address ?? "";
    case "city":
      return c.city ?? "";
    case "region":
      return c.region ?? "";
    case "postal_code":
      return c.postal_code ?? "";
    case "country":
      return c.country ?? "";
    case "company_name":
      return c.companies?.name ?? "";
    case "company_city":
      return c.companies?.city ?? "";
    case "company_industry":
      return c.companies?.industry ?? "";
    case "created_at":
      return c.created_at ?? "";
    case "appointment_date":
      return c.appointment_date ?? "";
    default:
      return "";
  }
}

/**
 * Evaluate one rule against one contact. `now` is injected so a whole
 * evaluation pass shares a single clock — otherwise two rules in the same
 * definition could straddle a day boundary and disagree.
 */
export function evaluateRule(
  c: EvaluableContact,
  rule: Rule,
  now: number = Date.now()
): boolean {
  const raw = fieldValue(c, rule.field);
  const v = raw.toLowerCase();
  const target = (rule.value ?? "").toLowerCase();

  switch (rule.op) {
    case "equals":
      return v === target;
    case "not_equals":
      return v !== target;
    case "is_any_of":
      return (rule.values ?? []).some((x) => x.toLowerCase() === v);
    case "is_none_of":
      return !(rule.values ?? []).some((x) => x.toLowerCase() === v);
    case "contains":
      return target !== "" && v.includes(target);
    case "not_contains":
      return target === "" || !v.includes(target);
    case "is_empty":
      return v === "";
    case "is_not_empty":
      return v !== "";
    case "before":
    case "after": {
      const t = Date.parse(raw);
      const bound = Date.parse(rule.value ?? "");
      if (!Number.isFinite(t) || !Number.isFinite(bound)) return false;
      return rule.op === "before" ? t < bound : t > bound;
    }
    case "in_last_days":
    case "not_in_last_days": {
      const days = Number(rule.value);
      const t = Date.parse(raw);
      if (!Number.isFinite(days) || days <= 0) return false;
      // A missing date is not "in the last N days", so it satisfies the
      // negated form — mirrors how not_contains treats an empty field.
      if (!Number.isFinite(t)) return rule.op === "not_in_last_days";
      const inWindow = t >= now - days * 86_400_000 && t <= now;
      return rule.op === "in_last_days" ? inWindow : !inWindow;
    }
    default:
      return false;
  }
}

export function matchesDefinition(
  c: EvaluableContact,
  def: SegmentDefinition,
  now: number = Date.now()
): boolean {
  const rules = def.rules ?? [];
  if (rules.length === 0) return true; // empty filter → everyone
  return def.match === "any"
    ? rules.some((r) => evaluateRule(c, r, now))
    : rules.every((r) => evaluateRule(c, r, now));
}

export function evaluateFilter<T extends EvaluableContact>(
  contacts: T[],
  def: SegmentDefinition
): T[] {
  // One clock for the whole pass, so relative-date rules can't straddle a
  // boundary mid-scan and put two identical contacts on opposite sides.
  const now = Date.now();
  return contacts.filter((c) => matchesDefinition(c, def, now));
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
    const def = fieldDef(field);
    if (!def) continue;
    if (!OPERATOR_LABELS[op]) continue;
    // An operator has to be legal for the field's kind — otherwise a stale
    // rule (field changed kind, or a hand-edited definition) evaluates in a
    // way the builder can never show or correct.
    if (!OPERATORS_FOR_KIND[def.kind].includes(op)) continue;

    if (VALUELESS_OPS.includes(op)) {
      rules.push({ field, op });
    } else if (MULTI_VALUE_OPS.includes(op)) {
      const values = Array.isArray(rr.values)
        ? [
            ...new Set(
              rr.values.filter((x): x is string => typeof x === "string")
            ),
          ]
        : [];
      rules.push({ field, op, values });
    } else {
      rules.push({
        field,
        op,
        value: typeof rr.value === "string" ? rr.value : "",
      });
    }
  }
  return { match, rules };
}

/**
 * Why a rule can't be saved. Empty array = usable. A rule with no value is
 * the trap this catches: "Lifecycle stage is <blank>" matches nobody and
 * "is not <blank>" matches everybody, and both save silently without this.
 */
export function ruleErrors(rule: Rule): string[] {
  const def = fieldDef(rule.field);
  if (!def) return ["Pick a field."];
  if (!OPERATOR_LABELS[rule.op]) return ["Pick a condition."];
  if (!OPERATORS_FOR_KIND[def.kind].includes(rule.op))
    return [`"${OPERATOR_LABELS[rule.op]}" doesn't apply to ${def.label}.`];

  if (VALUELESS_OPS.includes(rule.op)) return [];

  if (MULTI_VALUE_OPS.includes(rule.op)) {
    if (!(rule.values ?? []).length) return ["Pick at least one value."];
    return [];
  }

  const value = (rule.value ?? "").trim();
  if (!value) return ["Enter a value."];

  if (DAY_COUNT_OPS.includes(rule.op)) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0)
      return ["Enter a whole number of days greater than 0."];
  }
  if (DATE_OPS.includes(rule.op) && !Number.isFinite(Date.parse(value)))
    return ["Enter a valid date."];

  return [];
}

/** Per-rule validation messages, indexed the same as `def.rules`. */
export function definitionErrors(def: SegmentDefinition): string[][] {
  return (def.rules ?? []).map(ruleErrors);
}

/** True when every rule in the definition is fully configured. */
export function isDefinitionValid(def: SegmentDefinition): boolean {
  return definitionErrors(def).every((e) => e.length === 0);
}

/** Human-readable one-liner for a single filter rule. */
export function describeRule(rule: Rule): string {
  const label = fieldDef(rule.field)?.label ?? rule.field;
  const op = OPERATOR_LABELS[rule.op] ?? rule.op;
  if (VALUELESS_OPS.includes(rule.op)) return `${label} ${op}`;
  if (MULTI_VALUE_OPS.includes(rule.op))
    return `${label} ${op} ${(rule.values ?? []).join(", ")}`.trim();
  if (DAY_COUNT_OPS.includes(rule.op))
    return `${label} ${op} ${rule.value ?? ""} days`.trim();
  return `${label} ${op} ${rule.value ?? ""}`.trim();
}

/** Supabase select string that yields EvaluableContact rows. */
export const EVALUABLE_SELECT =
  "id, email, first_name, last_name, title, phone, source, lead_source, address, city, region, postal_code, country, lifecycle_stage, unsubscribed_at, appointment_date, created_at, companies(name, city, industry)";

/**
 * Fetch every evaluable contact for an org, paging past PostgREST's default
 * 1000-row cap. Segment evaluation MUST see the full contact set — a truncated
 * read would silently drop members past the cap and (in the cron) delete them
 * from segment_members.
 */
export async function fetchAllEvaluable(
  client: SupabaseClient,
  orgId: string
): Promise<EvaluableContact[]> {
  const PAGE = 1000;
  const all: EvaluableContact[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from("contacts")
      .select(EVALUABLE_SELECT)
      .eq("org_id", orgId)
      // `id` makes the sort deterministic; without it a page boundary can drop
      // or repeat rows, which for segment evaluation means losing members.
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as EvaluableContact[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

/**
 * Every contact id in a segment: the cached membership rows for a static
 * segment, a live evaluation for a dynamic one. Both paged.
 */
export async function fetchSegmentMemberIds(
  client: SupabaseClient,
  orgId: string,
  segment: Pick<Segment, "id" | "type" | "definition">
): Promise<string[]> {
  if (segment.type === "dynamic") {
    const contacts = await fetchAllEvaluable(client, orgId);
    return evaluateFilter(contacts, parseDefinition(segment.definition)).map(
      (c) => c.id
    );
  }
  const PAGE = 1000;
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from("segment_members")
      .select("contact_id")
      .eq("segment_id", segment.id)
      .order("contact_id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { contact_id: string }[];
    ids.push(...rows.map((r) => r.contact_id));
    if (rows.length < PAGE) break;
  }
  return ids;
}

/** Split a list into fixed-size batches (membership writes, event payloads). */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Rows per `segment_members` write. Keeps a big snapshot off one giant insert. */
export const MEMBER_WRITE_CHUNK = 500;

/**
 * Replace a segment's cached membership with `contactIds`, chunked so a large
 * segment doesn't ride on one oversized insert. Throws on the first failure —
 * the delete has already run by then, so a swallowed error would leave the
 * segment empty while the caller reports success.
 */
export async function replaceSegmentMembers(
  client: SupabaseClient,
  orgId: string,
  segmentId: string,
  contactIds: string[]
): Promise<void> {
  const { error: delErr } = await client
    .from("segment_members")
    .delete()
    .eq("segment_id", segmentId);
  if (delErr) throw new Error(delErr.message);

  for (const part of chunk(contactIds, MEMBER_WRITE_CHUNK)) {
    const { error } = await client.from("segment_members").insert(
      part.map((cid) => ({
        org_id: orgId,
        segment_id: segmentId,
        contact_id: cid,
      }))
    );
    if (error) throw new Error(error.message);
  }
}
