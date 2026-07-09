// Best-effort email discovery: fetch a company's homepage and extract the first
// plausible public email. Times out fast and never throws. Google Places does
// not provide emails, so this is how scraped companies get a contact.

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Skip asset filenames that look like emails and generic no-reply addresses.
const SKIP = /(no-?reply|example\.com|\.(png|jpg|jpeg|gif|webp|svg|css|js)$)/i;

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
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "HandshakeBot/1.0 (+lead-enrichment)" },
    });
    if (!res.ok) return null;
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
