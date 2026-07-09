// Pure contact data-quality detection. Used by the issues page (server) and
// reusable/testable. No I/O — takes contacts, returns issues.

import { contactName, type ContactWithCompany } from "./types";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FormattingIssueType =
  | "invalid_email"
  | "missing_email"
  | "missing_name"
  | "invalid_phone"
  | "missing_phone";

export const FORMATTING_LABELS: Record<FormattingIssueType, string> = {
  invalid_email: "Invalid email",
  missing_email: "Missing email",
  missing_name: "Missing name",
  invalid_phone: "Invalid phone",
  missing_phone: "Missing phone",
};

export type DuplicateGroup = {
  key: string;
  reason: "email" | "name_company";
  label: string;
  contacts: ContactWithCompany[];
};

export type FormattingIssue = {
  contact: ContactWithCompany;
  reasons: FormattingIssueType[];
};

export type DataQualityReport = {
  duplicateEmailGroups: DuplicateGroup[];
  duplicateNameGroups: DuplicateGroup[];
  formatting: FormattingIssue[];
  counts: {
    duplicateContacts: number;
    invalidEmail: number;
    missingEmail: number;
    missingName: number;
    invalidPhone: number;
    missingPhone: number;
    total: number;
  };
};

/** Compact summary for post-ingest callouts (uploads, integrations). */
export type ContactIssueSummary = {
  total: number;
  duplicateContacts: number;
  invalid: number;
};

/**
 * A missing phone is optional for most contacts, so a row whose *only* problem
 * is a missing phone doesn't count toward org-wide health signals (the contacts
 * badge, prospect/import callouts). It still surfaces on the Data health page.
 */
function isSignificant(f: FormattingIssue): boolean {
  return f.reasons.some((r) => r !== "missing_phone");
}

export function summarize(report: DataQualityReport): ContactIssueSummary {
  return {
    total: report.counts.total,
    duplicateContacts: report.counts.duplicateContacts,
    invalid: report.formatting.filter(isSignificant).length,
  };
}

function digits(s: string): string {
  return s.replace(/\D/g, "");
}

export function detectIssues(
  contacts: ContactWithCompany[]
): DataQualityReport {
  // --- Duplicates by email (case-insensitive) ---
  const byEmail = new Map<string, ContactWithCompany[]>();
  for (const c of contacts) {
    const email = c.email?.trim().toLowerCase();
    if (!email) continue;
    (byEmail.get(email) ?? byEmail.set(email, []).get(email)!).push(c);
  }
  const duplicateEmailGroups: DuplicateGroup[] = [];
  for (const [email, group] of byEmail) {
    if (group.length > 1) {
      duplicateEmailGroups.push({
        key: `email:${email}`,
        reason: "email",
        label: email,
        contacts: group,
      });
    }
  }

  // --- Possible duplicates by name + company (no shared email) ---
  const emailDupIds = new Set(
    duplicateEmailGroups.flatMap((g) => g.contacts.map((c) => c.id))
  );
  const byNameCompany = new Map<string, ContactWithCompany[]>();
  for (const c of contacts) {
    const name = contactName(c).trim().toLowerCase();
    if (name === "unnamed contact") continue;
    const company = (c.companies?.name ?? "").trim().toLowerCase();
    const key = `${name}|${company}`;
    (byNameCompany.get(key) ?? byNameCompany.set(key, []).get(key)!).push(c);
  }
  const duplicateNameGroups: DuplicateGroup[] = [];
  for (const [key, group] of byNameCompany) {
    // Only flag if it isn't already caught as an exact email duplicate.
    const notAlreadyEmailDup = group.filter((c) => !emailDupIds.has(c.id));
    if (group.length > 1 && notAlreadyEmailDup.length > 1) {
      const [name] = key.split("|");
      const company = group[0].companies?.name;
      duplicateNameGroups.push({
        key: `name:${key}`,
        reason: "name_company",
        label: company ? `${name} @ ${company}` : name,
        contacts: group,
      });
    }
  }

  // --- Formatting & completeness ---
  const formatting: FormattingIssue[] = [];
  const tally: Record<FormattingIssueType, number> = {
    invalid_email: 0,
    missing_email: 0,
    missing_name: 0,
    invalid_phone: 0,
    missing_phone: 0,
  };
  for (const c of contacts) {
    const reasons: FormattingIssueType[] = [];
    const email = c.email?.trim();
    if (email && !EMAIL_RE.test(email)) reasons.push("invalid_email");
    else if (!email) reasons.push("missing_email");
    if (!c.first_name && !c.last_name) reasons.push("missing_name");
    const phone = c.phone?.trim();
    if (phone && digits(phone).length < 7) reasons.push("invalid_phone");
    else if (!phone) reasons.push("missing_phone");

    // Drop anything the user has explicitly skipped for this contact.
    const dismissed = new Set(c.dismissed_issues ?? []);
    const kept = reasons.filter((r) => !dismissed.has(r));
    if (!kept.length) continue;
    for (const r of kept) tally[r]++;
    formatting.push({ contact: c, reasons: kept });
  }
  const {
    invalid_email: invalidEmail,
    missing_email: missingEmail,
    missing_name: missingName,
    invalid_phone: invalidPhone,
    missing_phone: missingPhone,
  } = tally;

  const duplicateContacts =
    duplicateEmailGroups.reduce((n, g) => n + g.contacts.length, 0) +
    duplicateNameGroups.reduce((n, g) => n + g.contacts.length, 0);

  return {
    duplicateEmailGroups,
    duplicateNameGroups,
    formatting,
    counts: {
      duplicateContacts,
      invalidEmail,
      missingEmail,
      missingName,
      invalidPhone,
      missingPhone,
      // Missing-phone-only rows are excluded — see isSignificant().
      total:
        duplicateEmailGroups.length +
        duplicateNameGroups.length +
        formatting.filter(isSignificant).length,
    },
  };
}
