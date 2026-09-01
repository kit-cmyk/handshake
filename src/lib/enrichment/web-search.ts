// Web search, used only as the last resort in the LinkedIn backfill: when a
// prospect's own site never links their LinkedIn page, the page usually still
// exists and a search engine is the only way left to find it.
//
// Two backends:
//   • Brave Search API (WEB_SEARCH_API_KEY) — a real, rate-limited, terms-clean
//     API. Use this in production.
//   • DuckDuckGo's HTML endpoint — no key required, but it is scraping a search
//     engine: it can be blocked or throttled at any time and the markup can
//     change without notice. It is the default only so the feature does
//     something useful out of the box; treat a working result as a bonus.
//
// Set LINKEDIN_LOOKUP_SEARCH=off to skip the search tier entirely and keep the
// backfill confined to crawling the prospect's own website.

import { fetchPublicPage } from "@/lib/places/enrich";

export type SearchHit = { url: string; title: string };

export type SearchBackend = "brave" | "duckduckgo" | "off";

/** Which backend the current environment will use. */
export function searchBackend(): SearchBackend {
  if (process.env.LINKEDIN_LOOKUP_SEARCH === "off") return "off";
  return process.env.WEB_SEARCH_API_KEY ? "brave" : "duckduckgo";
}

/**
 * DuckDuckGo wraps every result in a redirect (`/l/?uddg=<encoded>`), and Brave
 * occasionally returns tracking-wrapped URLs too. Unwrap to the real target so
 * callers can pattern-match on the destination.
 */
export function unwrapResultUrl(raw: string): string | null {
  if (!raw) return null;
  const url = raw.startsWith("//") ? `https:${raw}` : raw;
  try {
    const u = new URL(url, "https://duckduckgo.com");
    const wrapped = u.searchParams.get("uddg");
    if (wrapped) return wrapped;
    return u.toString();
  } catch {
    return null;
  }
}

/** Pull result links out of DuckDuckGo's HTML endpoint markup. */
export function parseDuckDuckGoHtml(html: string, limit: number): SearchHit[] {
  const hits: SearchHit[] = [];
  const anchor =
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchor.exec(html)) && hits.length < limit) {
    const url = unwrapResultUrl(decodeHtml(m[1]));
    if (!url) continue;
    hits.push({ url, title: stripTags(decodeHtml(m[2])).trim() });
  }
  return hits;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

type BraveResponse = {
  web?: { results?: { url?: string; title?: string }[] };
};

async function braveSearch(
  query: string,
  limit: number,
  apiKey: string
): Promise<SearchHit[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
    query
  )}&count=${limit}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as BraveResponse;
    return (data.web?.results ?? [])
      .map((r) => ({
        url: unwrapResultUrl(r.url ?? ""),
        title: r.title ?? "",
      }))
      .filter((r): r is SearchHit => !!r.url)
      .slice(0, limit);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run a web search. Returns [] on any failure — a blocked or missing search
 * backend must degrade to "no LinkedIn found", never break the job.
 */
export async function searchWeb(
  query: string,
  limit = 5
): Promise<SearchHit[]> {
  const backend = searchBackend();
  if (backend === "off" || !query.trim()) return [];

  if (backend === "brave") {
    return braveSearch(query, limit, process.env.WEB_SEARCH_API_KEY!);
  }

  const html = await fetchPublicPage(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    6000
  );
  return html ? parseDuckDuckGoHtml(html, limit) : [];
}
