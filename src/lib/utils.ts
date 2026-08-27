import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Display form for a raw enum value shown to the user — a status, stage, type,
 * or role. Underscores become spaces and the first letter is capitalized, so
 * "stage_moved" reads "Stage moved". Statuses come out of the database
 * lowercase; every surface that shows one runs it through here so the same
 * value never reads two ways in two places.
 */
export function statusLabel(value: string | null | undefined): string {
  const text = (value ?? "").replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Plural form of a singular noun. Every surface that counts records runs
 * through here so "3 companies" never renders as "3 companys" on one screen
 * and correctly on the next.
 */
export function plural(noun: string, n: number): string {
  if (n === 1) return noun;
  // "company" -> "companies". A consonant before the -y turns it into -ies;
  // a vowel before it keeps the plain -s ("day" -> "days").
  if (/[^aeiou]y$/i.test(noun)) return `${noun.slice(0, -1)}ies`;
  // Sibilant endings take -es ("address" -> "addresses", "batch" -> "batches").
  if (/(s|x|z|ch|sh)$/i.test(noun)) return `${noun}es`;
  return `${noun}s`;
}

/**
 * Currency for display. One formatter for the whole app: the same deal value
 * has to read identically on the board, in a sheet, and on the dashboard.
 *
 * `fallback` is what an absent value renders as — "" where the caller hides the
 * field entirely, "—" where it holds a column that must stay aligned.
 */
export function money(
  value: number | null | undefined,
  fallback = ""
): string {
  if (value == null) return fallback;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Coarse relative time — "3m ago", "5h ago", "2d ago". Deliberately stops at
 * days: past a week the exact age stops mattering and a date reads better.
 *
 * A future timestamp reads "just now" rather than a negative age, because the
 * usual cause is a second of clock skew between the database and the browser,
 * not a genuinely scheduled event.
 */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const diff = Date.now() - then;
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
