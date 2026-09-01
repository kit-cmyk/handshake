// Fallback LinkedIn discovery, run in the background after Find leads imports.
//
// Search-time enrichment only looks at a company's homepage, and the people
// providers only return a profile URL when their own data has one — so plenty
// of records land in the CRM with no LinkedIn at all. This module takes a
// second, slower pass:
//
//   1. Crawl a handful of likely pages on the prospect's OWN site (about,
//      contact, team, …). Cheap, well-behaved, and where most small businesses
//      actually put their social links.
//   2. Only if that fails, ask a search engine (see ./web-search).
//
// Everything here is best-effort: any miss leaves the record as it was.

import { fetchPublicPage, extractCompanyLinkedIn } from "@/lib/places/enrich";
import { normalizeLinkedIn } from "@/lib/linkedin";
import { searchWeb } from "./web-search";

/** How the URL was found — reported back so a run's cost is visible. */
export type LookupSource = "site" | "search";

export type LookupResult = {
  url: string | null;
  source: LookupSource | null;
  /** Pages fetched, so callers can see what a run actually cost. */
  fetched: number;
};

/** Page paths worth a look when the homepage had nothing. */
const CANDIDATE_PATHS = [
  "/about",
  "/about-us",
  "/contact",
  "/contact-us",
  "/team",
  "/our-team",
  "/company",
];

/** Hard cap on page fetches per record, so one bad site can't stall a batch. */
const MAX_PAGES = 6;

/**
 * Same-site links from a page whose text or href suggests an about/contact/team
 * page. Following the site's real links beats guessing paths — `/nosotros`,
 * `/impressum` and `/who-we-are` are all common and none are guessable.
 */
export function crawlCandidates(html: string, baseUrl: string): string[] {
  const wanted =
    /(about|contact|team|company|people|staff|impressum|nosotros|kontakt)/i;
  const out: string[] = [];
  const seen = new Set<string>();

  let base: URL;
  try {
    base = new URL(/^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`);
  } catch {
    return out;
  }

  const anchor = /<a[^>]+href="([^"#][^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchor.exec(html))) {
    const href = m[1];
    const text = m[2].replace(/<[^>]*>/g, " ");
    if (!wanted.test(href) && !wanted.test(text)) continue;

    let u: URL;
    try {
      u = new URL(href, base);
    } catch {
      continue;
    }
    // Same site only — an outbound "about us" link belongs to someone else.
    if (u.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, ""))
      continue;
    if (u.protocol !== "http:" && u.protocol !== "https:") continue;

    u.hash = "";
    const key = u.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Absolute URLs for the guessed paths, used when the page links nothing useful. */
export function guessedPaths(baseUrl: string): string[] {
  try {
    const base = new URL(
      /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`
    );
    return CANDIDATE_PATHS.map((p) => new URL(p, base).toString());
  } catch {
    return [];
  }
}

/** Every LinkedIn *personal* profile link in a page, with its anchor text. */
export function extractProfileLinks(
  html: string
): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  const seen = new Set<string>();
  const anchor =
    /<a[^>]+href="((?:https?:)?\/\/[^"]*linkedin\.com\/(?:in|pub)\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchor.exec(html))) {
    const raw = m[1].startsWith("//") ? `https:${m[1]}` : m[1];
    const url = normalizeLinkedIn(raw.replace(/&amp;/g, "&"));
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, text: m[2].replace(/<[^>]*>/g, " ").trim() });
  }
  return out;
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Does this profile link belong to the person we are looking for?
 *
 * A team page lists many people, so picking the wrong `/in/` link would write a
 * stranger's profile onto the contact. Both name parts must appear — in the
 * slug or the anchor text — before we will accept it.
 */
export function matchesPerson(
  candidate: { url: string; text: string },
  firstName: string | null,
  lastName: string | null
): boolean {
  // Both sides go through the same tokenizer, so an accented name in the CRM
  // still matches the unaccented slug LinkedIn generates from it.
  const first = tokens(firstName ?? "");
  const last = tokens(lastName ?? "");
  if (!first.length || !last.length) return false;

  const slug = candidate.url.split("/").pop() ?? "";
  const haystack = new Set([...tokens(slug), ...tokens(candidate.text)]);
  return [...first, ...last].every((t) => haystack.has(t));
}

/** `"Acme Dental" Austin site:linkedin.com/company` */
export function companySearchQuery(name: string, place?: string | null): string {
  return [`"${name}"`, place?.trim(), "site:linkedin.com/company"]
    .filter(Boolean)
    .join(" ");
}

/** `"Jane Doe" "Acme Dental" site:linkedin.com/in` */
export function personSearchQuery(
  name: string,
  company?: string | null
): string {
  return [`"${name}"`, company ? `"${company}"` : null, "site:linkedin.com/in"]
    .filter(Boolean)
    .join(" ");
}

/** Pick the first search hit that is actually a LinkedIn URL of the right kind. */
export function firstLinkedInHit(
  hits: { url: string }[],
  kind: "company" | "in"
): string | null {
  for (const h of hits) {
    const url = normalizeLinkedIn(h.url);
    if (!url) continue;
    if (kind === "company" && /\/(company|school|showcase)\//.test(url))
      return url;
    if (kind === "in" && /\/(in|pub)\//.test(url)) return url;
  }
  return null;
}

/** Find a company's LinkedIn page: crawl its site, then search. */
export async function lookupCompanyLinkedIn(input: {
  name: string;
  website: string | null;
  city?: string | null;
}): Promise<LookupResult> {
  let fetched = 0;

  if (input.website) {
    const home = await fetchPublicPage(input.website);
    fetched++;
    if (home) {
      const direct = extractCompanyLinkedIn(home);
      if (direct) return { url: direct, source: "site", fetched };

      // Prefer the site's own about/contact links, then guessed paths.
      const seen = new Set<string>();
      const pages = [
        ...crawlCandidates(home, input.website),
        ...guessedPaths(input.website),
      ].filter((u) => (seen.has(u) ? false : (seen.add(u), true)));

      for (const page of pages) {
        if (fetched >= MAX_PAGES) break;
        const html = await fetchPublicPage(page);
        fetched++;
        if (!html) continue;
        const found = extractCompanyLinkedIn(html);
        if (found) return { url: found, source: "site", fetched };
      }
    }
  }

  const hits = await searchWeb(companySearchQuery(input.name, input.city), 5);
  const searched = firstLinkedInHit(hits, "company");
  return { url: searched, source: searched ? "search" : null, fetched };
}

/**
 * Find a person's LinkedIn profile: look for them on their employer's site
 * (team/about pages), then search.
 *
 * LinkedIn itself is never fetched — it serves an auth wall to bots and
 * scraping it breaks their terms. We only ever collect links *to* profiles.
 */
export async function lookupPersonLinkedIn(input: {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  companyWebsite: string | null;
}): Promise<LookupResult> {
  let fetched = 0;
  const fullName = [input.firstName, input.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!fullName) return { url: null, source: null, fetched };

  if (input.companyWebsite) {
    const home = await fetchPublicPage(input.companyWebsite);
    fetched++;
    if (home) {
      const seen = new Set<string>();
      const pages = [
        ...crawlCandidates(home, input.companyWebsite),
        ...guessedPaths(input.companyWebsite),
      ].filter((u) => (seen.has(u) ? false : (seen.add(u), true)));

      // The homepage is already in hand — check it before fetching anything.
      for (const candidate of extractProfileLinks(home)) {
        if (matchesPerson(candidate, input.firstName, input.lastName))
          return { url: candidate.url, source: "site", fetched };
      }

      for (const page of pages) {
        if (fetched >= MAX_PAGES) break;
        const html = await fetchPublicPage(page);
        fetched++;
        if (!html) continue;
        for (const candidate of extractProfileLinks(html)) {
          if (matchesPerson(candidate, input.firstName, input.lastName))
            return { url: candidate.url, source: "site", fetched };
        }
      }
    }
  }

  const hits = await searchWeb(
    personSearchQuery(fullName, input.companyName),
    5
  );
  const searched = firstLinkedInHit(hits, "in");
  return { url: searched, source: searched ? "search" : null, fetched };
}
