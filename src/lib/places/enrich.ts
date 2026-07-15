// Best-effort email discovery: fetch a company's homepage and extract the first
// plausible public email. Times out fast and never throws. Google Places does
// not provide emails, so this is how scraped companies get a contact.

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

export async function discoverEmail(
  website: string | null,
  timeoutMs = 4000
): Promise<string | null> {
  if (!website) return null;
  let url = website.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Follow redirects manually, re-validating each hop so a public URL can't
    // 30x-redirect us onto an internal address.
    let current = url;
    let res: Response | null = null;
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
      res = r;
      break;
    }
    if (!res || !res.ok) return null;
    const html = await res.text();
    const matches = html.match(EMAIL_RE) ?? [];
    for (const m of matches) {
      if (!SKIP.test(m)) return m.toLowerCase();
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
