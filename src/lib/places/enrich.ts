// Best-effort contact discovery: fetch a company's homepage and extract the
// first plausible public email and its LinkedIn page. Times out fast and never
// throws. Google Places provides neither, so this is how scraped companies get
// a contact address and a LinkedIn link.

import { LINKEDIN_COMPANY_RE, normalizeLinkedIn } from "@/lib/linkedin";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Skip asset filenames that look like emails and generic no-reply addresses.
const SKIP = /(no-?reply|example\.com|\.(png|jpg|jpeg|gif|webp|svg|css|js)$)/i;

/**
 * SSRF guard: this fetch targets a URL that ultimately comes from provider/user
 * data, so refuse anything that isn't public http(s). Blocks non-http schemes,
 * localhost, and private/link-local IP literals (incl. the cloud metadata
 * endpoint 169.254.169.254). Doesn't defend DNS rebinding, but stops the common
 * "point website at an internal address" attack.
 */
function isPublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;

  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal"
  )
    return false;

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return false; // this/private/loopback
    if (a === 169 && b === 254) return false; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false; // private
    if (a === 192 && b === 168) return false; // private
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    return true;
  }
  // Reject IPv6 literals outright — legitimate sites use hostnames.
  if (host.includes(":")) return false;
  return true;
}

/** What a single homepage fetch can yield. */
export type SiteContact = {
  email: string | null;
  linkedinUrl: string | null;
};

/**
 * Fetch a page as HTML text, or null if it can't be reached safely.
 *
 * Shared by every outbound scrape (homepage enrichment, the deeper LinkedIn
 * crawl, search-engine lookups) so they all get the same SSRF guard: each
 * redirect hop is re-validated, so a public URL can't 30x us onto an internal
 * address. Never throws — a dead site is a normal outcome here.
 */
export async function fetchPublicPage(
  rawUrl: string,
  timeoutMs = 4000
): Promise<string | null> {
  let url = rawUrl.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = url;
    for (let hop = 0; hop <= 3; hop++) {
      if (!isPublicHttpUrl(current)) return null;
      const r = await fetch(current, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "user-agent": "HandshakeBot/1.0 (+lead-enrichment)" },
      });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location");
        if (!loc) return null;
        current = new URL(loc, current).toString();
        continue;
      }
      if (!r.ok) return null;
      return await r.text();
    }
    return null; // too many redirects
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** First plausible public email in a page's markup. */
export function extractEmail(html: string): string | null {
  for (const m of html.match(EMAIL_RE) ?? []) {
    if (!SKIP.test(m)) return m.toLowerCase();
  }
  return null;
}

/** First LinkedIn *company* page linked from a page's markup. */
export function extractCompanyLinkedIn(html: string): string | null {
  for (const m of html.match(LINKEDIN_COMPANY_RE) ?? []) {
    const normalized = normalizeLinkedIn(m);
    if (normalized) return normalized;
  }
  return null;
}

/**
 * Fetch a company's homepage once and pull out both an email and a LinkedIn
 * page. One fetch for both — these are looked up together at search time and
 * the page visit is by far the expensive part.
 *
 * A miss here isn't final: plenty of sites only link their LinkedIn from an
 * about/contact page, which the background backfill job crawls later
 * (see lib/enrichment/linkedin-lookup).
 */
export async function discoverSiteContact(
  website: string | null,
  timeoutMs = 4000
): Promise<SiteContact> {
  if (!website) return { email: null, linkedinUrl: null };
  const html = await fetchPublicPage(website, timeoutMs);
  if (!html) return { email: null, linkedinUrl: null };
  return {
    email: extractEmail(html),
    linkedinUrl: extractCompanyLinkedIn(html),
  };
}

/** Email only — kept for callers that don't need the LinkedIn page. */
export async function discoverEmail(
  website: string | null,
  timeoutMs = 4000
): Promise<string | null> {
  return (await discoverSiteContact(website, timeoutMs)).email;
}
