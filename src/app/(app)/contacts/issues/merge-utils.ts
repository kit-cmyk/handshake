import { type ContactWithCompany } from "@/lib/types";
import { type DuplicateGroup } from "@/lib/data-quality";

// Mirrors BACKFILL_FIELDS in actions.ts — used to pick the record worth keeping.
export function completeness(c: ContactWithCompany): number {
  return [
    c.email,
    c.first_name,
    c.last_name,
    c.phone,
    c.title,
    c.company_id,
  ].filter(Boolean).length;
}

/** The most complete contact in a group — the sensible default to keep. */
export function defaultKeepId(group: DuplicateGroup): string {
  return [...group.contacts].sort(
    (a, b) => completeness(b) - completeness(a)
  )[0].id;
}

/**
 * Default merge plan for a group: keep the most complete record, merge every
 * other one into it. Used for one-click bulk merge across selected groups.
 */
export function defaultMergePlan(group: DuplicateGroup): {
  keepId: string;
  mergeIds: string[];
} {
  const keepId = defaultKeepId(group);
  return {
    keepId,
    mergeIds: group.contacts.filter((c) => c.id !== keepId).map((c) => c.id),
  };
}
