// Pure parsing for the Cc / Bcc fields an agent types into the inbox composer.
// People paste address lists in every shape — commas, semicolons, newlines,
// "Name <addr>" pairs from another mail client — so normalize here once and let
// the callers deal only with clean, deduped addresses. Side-effect free.

import { EMAIL_RE } from "@/lib/data-quality";

/** Upper bound per field, so one paste can't fan a send out to a mailing list. */
export const MAX_RECIPIENTS = 20;

export type ParsedAddressList = {
  /** Valid, lowercased, deduped addresses in the order first seen. */
  addresses: string[];
  /** Entries that aren't addresses, kept verbatim for the error message. */
  invalid: string[];
};

/** Pull the bare address out of a "Name <addr>" pair, or return the input. */
function bareAddress(token: string): string {
  const m = /<([^>]+)>/.exec(token);
  return (m ? m[1] : token).trim();
}

/**
 * Split a typed Cc/Bcc field into addresses. Separators are commas, semicolons
 * and whitespace — but not whitespace inside a "Name <addr>" pair, which is
 * matched first so pasting from a mail client works.
 */
export function parseAddressList(input: string | null | undefined): ParsedAddressList {
  const raw = (input ?? "").trim();
  if (!raw) return { addresses: [], invalid: [] };

  // "Name <addr>" pairs first, then whatever is left over between them.
  const pairs = raw.match(/[^,;]*<[^>]+>/g) ?? [];
  const rest = pairs.reduce((s, p) => s.replace(p, " "), raw);
  const tokens = [...pairs, ...rest.split(/[\s,;]+/)]
    .map((t) => bareAddress(t))
    .filter(Boolean);

  const addresses: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const email = token.toLowerCase();
    if (!EMAIL_RE.test(email)) {
      invalid.push(token);
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    addresses.push(email);
  }
  return { addresses, invalid };
}

/**
 * Parse a Cc/Bcc field for sending: rejects malformed entries and over-long
 * lists with a message the composer can show, and drops anyone already on the
 * To line so they aren't mailed twice.
 */
export function resolveCopyList(
  input: string | null | undefined,
  field: "Cc" | "Bcc",
  exclude: string[] = []
): { addresses: string[]; error?: string } {
  const { addresses, invalid } = parseAddressList(input);
  if (invalid.length) {
    return { addresses: [], error: `${field} has an invalid address: ${invalid[0]}` };
  }
  if (addresses.length > MAX_RECIPIENTS) {
    return {
      addresses: [],
      error: `${field} is limited to ${MAX_RECIPIENTS} addresses.`,
    };
  }
  const skip = new Set(exclude.map((e) => e.trim().toLowerCase()).filter(Boolean));
  return { addresses: addresses.filter((a) => !skip.has(a)) };
}

/** Render a stored address list back into a comma-separated field value. */
export function formatAddressList(addresses: string[] | null | undefined): string {
  return (addresses ?? []).join(", ");
}
