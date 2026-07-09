// Shared import field config — used by both the client wizard (mapping UI +
// preview validation) and the server action (authoritative validation).

export type Target = "contacts" | "companies";

export type FieldType = "text" | "email" | "number";

export type FieldDef = {
  key: string;
  label: string;
  required?: boolean;
  type?: FieldType;
  hint?: string;
};

export const CONTACT_FIELDS: FieldDef[] = [
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "email", label: "Email", type: "email", hint: "dedupe key" },
  { key: "phone", label: "Phone" },
  { key: "title", label: "Title" },
  { key: "company_name", label: "Company (name)", hint: "matched/created by name" },
  { key: "lifecycle_stage", label: "Lifecycle stage" },
  { key: "lead_source", label: "Lead source" },
  { key: "address", label: "Street address" },
  { key: "address_line2", label: "Address line 2" },
  { key: "city", label: "City" },
  { key: "region", label: "State/Region" },
  { key: "postal_code", label: "Postal code" },
  { key: "country", label: "Country" },
];

export const COMPANY_FIELDS: FieldDef[] = [
  { key: "name", label: "Name", required: true },
  { key: "industry", label: "Industry" },
  { key: "category", label: "Category" },
  { key: "website", label: "Website" },
  { key: "domain", label: "Domain", hint: "dedupe key" },
  { key: "phone", label: "Phone" },
  { key: "city", label: "City" },
  { key: "region", label: "Region/State" },
  { key: "employee_count", label: "Employees", type: "number" },
  { key: "annual_revenue", label: "Annual revenue", type: "number" },
  { key: "linkedin_url", label: "LinkedIn" },
];

export const FIELDS: Record<Target, FieldDef[]> = {
  contacts: CONTACT_FIELDS,
  companies: COMPANY_FIELDS,
};

export const DEDUPE_KEY: Record<Target, string> = {
  contacts: "email",
  companies: "domain",
};

export type DedupeMode = "skip" | "update" | "create";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A row after the client maps CSV columns → field keys. */
export type MappedRow = Record<string, string>;

export type RowIssue = { row: number; message: string };

/** Validate one mapped row. Returns an error message or null. `row` is 1-based. */
export function validateRow(target: Target, r: MappedRow): string | null {
  if (target === "contacts") {
    const hasName = !!(r.first_name || r.last_name);
    if (!hasName && !r.email) return "Needs a name or an email";
    if (r.email && !EMAIL_RE.test(r.email)) return `Invalid email: ${r.email}`;
  } else {
    if (!r.name || !r.name.trim()) return "Company name is required";
  }
  return null;
}
