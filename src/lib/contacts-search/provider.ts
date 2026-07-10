// Pluggable people/contact sourcing — the counterpart to src/lib/places/provider.ts.
// Google Places only returns businesses, so finding named people (name, title,
// email) needs a different source. Dev/default = MockContactsProvider
// (deterministic sample people, works offline). If PEOPLE_SEARCH_API_KEY is set,
// a real people-search provider is used instead.

export type ContactQuery = {
  /** Role/title to search for, e.g. "VP Sales", "Owner". Required. */
  title: string;
  location?: string;
  /** Company name or domain to anchor the search to. */
  company?: string;
  domain?: string;
  seniority?: string;
  department?: string;
  limit: number;
  /** Only return people we have an email for. */
  hasEmail?: boolean;
};

export type ContactResult = {
  /** Stable dedupe key (the people-search analog of a place id). */
  externalId: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  domain: string | null;
  city: string | null;
  region: string | null;
  linkedinUrl: string | null;
};

export interface ContactsProvider {
  readonly name: string;
  search(q: ContactQuery): Promise<ContactResult[]>;
}

// ---- Shared helpers ---------------------------------------------------------

/** Stable 32-bit hash of a string (FNV-1a). */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Best-effort domain from a "company or domain" free-text value. */
function toDomain(company?: string, domain?: string): string | null {
  const raw = (domain || company || "").trim().toLowerCase();
  if (!raw) return null;
  if (/\./.test(raw) && !/\s/.test(raw)) {
    return raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
  const slug = raw.replace(/[^a-z0-9]+/g, "");
  return slug ? `${slug}.example.com` : null;
}

// ---- Mock -------------------------------------------------------------------

const FIRST_NAMES = [
  "Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Avery",
  "Quinn", "Cameron", "Drew", "Sam", "Reese", "Skyler", "Devon", "Harper",
];
const LAST_NAMES = [
  "Nguyen", "Patel", "Garcia", "Kim", "Johnson", "Rossi", "Silva", "Khan",
  "Müller", "Brown", "Okafor", "Cohen", "Reyes", "Novak", "Haddad", "Walsh",
];

class MockContactsProvider implements ContactsProvider {
  readonly name = "mock";
  async search(q: ContactQuery): Promise<ContactResult[]> {
    const n = Math.min(Math.max(q.limit, 1), 60);
    const companyName =
      (q.company || q.domain || "Acme Co").split(/[.\s]/)[0] || "Acme Co";
    const cap = companyName.charAt(0).toUpperCase() + companyName.slice(1);
    const domain = toDomain(q.company, q.domain) ?? "acme.example.com";
    const titleCap =
      q.title.charAt(0).toUpperCase() + q.title.slice(1).toLowerCase();

    const results: ContactResult[] = [];
    for (let i = 1; i <= n; i++) {
      const seed = hashStr(
        `${q.title}-${companyName}-${q.location ?? ""}-${i}`.toLowerCase()
      );
      const first = FIRST_NAMES[seed % FIRST_NAMES.length];
      const last = LAST_NAMES[(seed >> 8) % LAST_NAMES.length];
      const slug = `${first}.${last}`.toLowerCase();
      results.push({
        externalId: `mock_${slug}_${domain}_${i}`,
        firstName: first,
        lastName: last,
        title: titleCap,
        email: `${slug}@${domain}`,
        phone: `+1 555 02${String(i).padStart(2, "0")}`,
        companyName: cap,
        domain,
        city: q.location?.split(",")[0]?.trim() ?? null,
        region: q.location?.split(",")[1]?.trim() ?? null,
        linkedinUrl: `https://www.linkedin.com/in/${slug}-${i}`,
      });
    }
    return results;
  }
}

// ---- Apollo (People Search API) ---------------------------------------------

// https://docs.apollo.io/reference/people-search
// NOTE: /mixed_people/search requires a PAID Apollo plan — on the free plan it
// returns HTTP 403 API_INACCESSIBLE. Search results also do not include
// unlocked emails unless the plan/credits allow it; Apollo returns a
// "email_not_unlocked@domain.com" placeholder in that case, which we treat as
// no email.

type ApolloPerson = {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  title?: string | null;
  email?: string | null;
  email_status?: string | null;
  linkedin_url?: string | null;
  city?: string | null;
  state?: string | null;
  phone_numbers?: { sanitized_number?: string; raw_number?: string }[];
  organization?: {
    name?: string | null;
    primary_domain?: string | null;
    website_url?: string | null;
  } | null;
};

function cleanEmail(p: ApolloPerson): string | null {
  const e = p.email?.trim();
  if (!e) return null;
  // Apollo returns a placeholder when the email isn't unlocked on this plan.
  if (/not_unlocked/i.test(e) || p.email_status === "unavailable") return null;
  return e.toLowerCase();
}

class ApolloContactsProvider implements ContactsProvider {
  readonly name = "apollo";
  constructor(private apiKey: string) {}

  async search(q: ContactQuery): Promise<ContactResult[]> {
    const perPage = Math.min(Math.max(q.limit, 1), 100);
    const domain = q.domain?.trim() || (q.company?.includes(".") ? q.company.trim() : undefined);
    const keywords = [q.department, !domain ? q.company : undefined]
      .filter(Boolean)
      .join(" ")
      .trim();

    const body: Record<string, unknown> = {
      page: 1,
      per_page: perPage,
      person_titles: q.title ? [q.title] : undefined,
      person_locations: q.location ? [q.location] : undefined,
      person_seniorities: q.seniority ? [q.seniority.toLowerCase()] : undefined,
      q_organization_domains_list: domain ? [domain] : undefined,
      q_keywords: keywords || undefined,
    };
    // Drop undefined keys so we don't send nulls Apollo may reject.
    for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];

    const res = await fetch(
      "https://api.apollo.io/api/v1/mixed_people/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "X-Api-Key": this.apiKey,
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      let msg = `Apollo API ${res.status}`;
      try {
        const j = JSON.parse(text) as { error?: string };
        if (j.error) msg = j.error;
      } catch {
        if (text) msg = `${msg}: ${text}`;
      }
      throw new Error(msg);
    }

    const data = (await res.json()) as { people?: ApolloPerson[] };
    const people = data.people ?? [];

    return people.map((p, i) => {
      const org = p.organization ?? null;
      return {
        externalId: p.id ?? `apollo_${i}`,
        firstName: p.first_name ?? null,
        lastName: p.last_name ?? null,
        title: p.title ?? null,
        email: cleanEmail(p),
        phone: p.phone_numbers?.[0]?.sanitized_number ?? null,
        companyName: org?.name ?? null,
        domain: org?.primary_domain ?? null,
        city: p.city ?? null,
        region: p.state ?? null,
        linkedinUrl: p.linkedin_url ?? null,
      };
    });
  }
}

export function getContactsProvider(): ContactsProvider {
  const key = process.env.PEOPLE_SEARCH_API_KEY;
  return key ? new ApolloContactsProvider(key) : new MockContactsProvider();
}

// ---- Pure helpers (tested) --------------------------------------------------

export type ContactFilters = {
  hasEmail?: boolean;
};

/** Apply condition filters the provider can't express natively. */
export function applyContactFilters(
  results: ContactResult[],
  f: ContactFilters
): ContactResult[] {
  return results.filter((r) => {
    if (f.hasEmail && !r.email) return false;
    return true;
  });
}

/** Split provider results into fresh vs. already-known (by externalId or email). */
export function partitionContacts(
  results: ContactResult[],
  existingKeys: Iterable<string>
): { fresh: ContactResult[]; duplicates: number } {
  const seen = new Set(
    Array.from(existingKeys, (k) => k.toLowerCase())
  );
  const fresh: ContactResult[] = [];
  let duplicates = 0;
  for (const r of results) {
    const emailKey = r.email?.toLowerCase();
    if (!r.externalId || seen.has(r.externalId.toLowerCase())) {
      duplicates++;
      continue;
    }
    if (emailKey && seen.has(emailKey)) {
      duplicates++;
      continue;
    }
    seen.add(r.externalId.toLowerCase());
    if (emailKey) seen.add(emailKey);
    fresh.push(r);
  }
  return { fresh, duplicates };
}

/** Map a contact result to a contacts-table insert payload. */
export function contactPayload(
  r: ContactResult,
  orgId: string,
  ownerId: string | null,
  companyId: string | null
) {
  return {
    org_id: orgId,
    company_id: companyId,
    first_name: r.firstName,
    last_name: r.lastName,
    title: r.title,
    email: r.email,
    phone: r.phone,
    city: r.city,
    region: r.region,
    owner_id: ownerId,
    lifecycle_stage: "new" as const,
    source: "people_search",
  };
}
