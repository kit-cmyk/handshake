// LinkedIn URL helpers, shared by the website scraper (places/enrich) and the
// people-search providers (contacts-search/provider). Both surface LinkedIn
// links from untrusted sources, so both need the same canonical form.

/**
 * Company pages only — a business site's footer often links a staff member's
 * personal /in/ profile, which isn't the company's page.
 */
export const LINKEDIN_COMPANY_RE =
  /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|school|showcase)\/[A-Za-z0-9_%.-]+/gi;

/**
 * Normalize to `https://www.linkedin.com/<kind>/<slug>` so the same page found
 * via different links (locale subdomain, tracking query, trailing slash)
 * dedupes to one value. Returns null for anything that isn't a LinkedIn
 * company or profile URL.
 */
export function normalizeLinkedIn(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  let url = raw.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;

  const path = u.pathname.replace(/\/+$/, "");
  const m = /^\/(company|school|showcase|in|pub)\/([^/]+)/i.exec(path);
  if (!m) return null;
  return `https://www.linkedin.com/${m[1].toLowerCase()}/${m[2]}`;
}
