// Pluggable CRM contact sourcing, mirroring src/lib/places/provider.ts.
//
// Each connector implements `fetchContacts()` and returns a normalized
// `CrmContact[]`. The registry marks a provider `token` or `oauth`; the factory
// builds a live provider when the stored connection has usable credentials, and
// otherwise returns a deterministic MockCrmProvider so the sync path is always
// exercisable in dev. Live providers page until exhausted or MAX_CONTACTS, and
// throw a readable Error on an API failure so the sync engine records it.
//
// OAuth token freshness (refresh before expiry) is handled by the sync engine,
// which can persist rotated tokens; providers here use the token they're handed.

import {
  readLiveConnection,
  readTokenFields,
  type CrmConnectionConfig,
  type LiveConnection,
} from "./connection";
import { crmMeta, type CrmProviderType } from "./providers";

/** A contact normalized across every CRM into Handshake's own shape. */
export type CrmContact = {
  externalId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  companyName: string | null;
};

export interface CrmProvider {
  readonly type: CrmProviderType;
  readonly mode: "live" | "mock";
  fetchContacts(): Promise<CrmContact[]>;
}

/** Hard ceiling on one sync so a huge CRM can't run unbounded. */
const MAX_CONTACTS = 2000;
const PAGE = 100;

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Split a single display name into first/last on the last space. */
function splitName(full: string | null): { first: string | null; last: string | null } {
  const s = str(full);
  if (!s) return { first: null, last: null };
  const i = s.lastIndexOf(" ");
  if (i < 0) return { first: s, last: null };
  return { first: s.slice(0, i), last: s.slice(i + 1) };
}

// ---- Mock -------------------------------------------------------------------

/** Stable 32-bit hash (FNV-1a) — same helper style as the places provider. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MOCK_FIRST = ["Ava", "Liam", "Noah", "Mia", "Ethan", "Zoe", "Owen", "Ivy"];
const MOCK_LAST = ["Reyes", "Chen", "Patel", "Nguyen", "Okafor", "Silva", "Kim"];
const MOCK_TITLES = ["Owner", "Office Manager", "Operations Lead", "Homeowner"];

/**
 * Deterministic sample contacts, seeded by (type + seed). Stable across runs so
 * a second sync dedupes cleanly by email instead of creating duplicates.
 */
export class MockCrmProvider implements CrmProvider {
  readonly mode = "mock" as const;
  constructor(
    readonly type: CrmProviderType,
    private seed: string,
    private count = 12,
  ) {}

  async fetchContacts(): Promise<CrmContact[]> {
    const n = Math.min(Math.max(this.count, 1), 50);
    const out: CrmContact[] = [];
    for (let i = 1; i <= n; i++) {
      const h = hashStr(`${this.type}:${this.seed}:${i}`);
      const first = MOCK_FIRST[h % MOCK_FIRST.length];
      const last = MOCK_LAST[(h >> 4) % MOCK_LAST.length];
      const company = `${this.type[0].toUpperCase()}${this.type.slice(1)} Sample Co ${(h >> 8) % 5}`;
      out.push({
        externalId: `mock_${this.type}_${i}`,
        firstName: first,
        lastName: last,
        email: `${first}.${last}.${i}@${this.type}-sample.example.com`.toLowerCase(),
        phone: `+1 555 02${String(i).padStart(2, "0")}`,
        title: MOCK_TITLES[(h >> 12) % MOCK_TITLES.length],
        companyName: company,
      });
    }
    return out;
  }
}

// ============================================================================
// Token-auth providers (user-pasted credentials)
// ============================================================================

// ---- HubSpot ----------------------------------------------------------------

class HubSpotProvider implements CrmProvider {
  readonly type = "hubspot" as const;
  readonly mode = "live" as const;
  constructor(private token: string) {}

  async fetchContacts(): Promise<CrmContact[]> {
    const props = ["firstname", "lastname", "email", "phone", "jobtitle", "company"];
    const out: CrmContact[] = [];
    let after: string | undefined;

    while (out.length < MAX_CONTACTS) {
      const url = new URL("https://api.hubapi.com/crm/v3/objects/contacts");
      url.searchParams.set("limit", String(PAGE));
      url.searchParams.set("properties", props.join(","));
      if (after) url.searchParams.set("after", after);

      const res = await fetch(url, {
        headers: { authorization: `Bearer ${this.token}` },
      });
      if (!res.ok) throw new Error(`HubSpot API ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as {
        results?: { id: string; properties?: Record<string, string | null> }[];
        paging?: { next?: { after?: string } };
      };
      for (const r of data.results ?? []) {
        const p = r.properties ?? {};
        out.push({
          externalId: r.id,
          firstName: str(p.firstname),
          lastName: str(p.lastname),
          email: str(p.email),
          phone: str(p.phone),
          title: str(p.jobtitle),
          companyName: str(p.company),
        });
      }
      after = data.paging?.next?.after;
      if (!after) break;
    }
    return out.slice(0, MAX_CONTACTS);
  }
}

// ---- Pipedrive --------------------------------------------------------------

class PipedriveProvider implements CrmProvider {
  readonly type = "pipedrive" as const;
  readonly mode = "live" as const;
  constructor(private domain: string, private token: string) {}

  async fetchContacts(): Promise<CrmContact[]> {
    const out: CrmContact[] = [];
    let start = 0;

    while (out.length < MAX_CONTACTS) {
      const url = new URL(`https://${this.domain}.pipedrive.com/api/v1/persons`);
      url.searchParams.set("api_token", this.token);
      url.searchParams.set("limit", String(PAGE));
      url.searchParams.set("start", String(start));

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Pipedrive API ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as {
        data?:
          | {
              id: number;
              first_name?: string | null;
              last_name?: string | null;
              email?: { value?: string; primary?: boolean }[] | null;
              phone?: { value?: string; primary?: boolean }[] | null;
              job_title?: string | null;
              org_name?: string | null;
            }[]
          | null;
        additional_data?: {
          pagination?: { more_items_in_collection?: boolean; next_start?: number };
        };
      };
      const primary = <T extends { value?: string; primary?: boolean }>(
        arr: T[] | null | undefined,
      ) => (arr?.find((x) => x.primary) ?? arr?.[0])?.value ?? null;
      for (const p of data.data ?? []) {
        out.push({
          externalId: String(p.id),
          firstName: str(p.first_name),
          lastName: str(p.last_name),
          email: str(primary(p.email)),
          phone: str(primary(p.phone)),
          title: str(p.job_title),
          companyName: str(p.org_name),
        });
      }
      const pg = data.additional_data?.pagination;
      if (!pg?.more_items_in_collection || pg.next_start == null) break;
      start = pg.next_start;
    }
    return out.slice(0, MAX_CONTACTS);
  }
}

// ---- Salesforce -------------------------------------------------------------

class SalesforceProvider implements CrmProvider {
  readonly type = "salesforce" as const;
  readonly mode = "live" as const;
  constructor(private instanceUrl: string, private token: string) {}

  async fetchContacts(): Promise<CrmContact[]> {
    const soql =
      "SELECT Id, FirstName, LastName, Email, Phone, Title, Account.Name FROM Contact";
    const base = this.instanceUrl.replace(/\/+$/, "");
    let next: string | null = `/services/data/v59.0/query?q=${encodeURIComponent(soql)}`;
    const out: CrmContact[] = [];

    while (next && out.length < MAX_CONTACTS) {
      const res: Response = await fetch(`${base}${next}`, {
        headers: { authorization: `Bearer ${this.token}` },
      });
      if (!res.ok) throw new Error(`Salesforce API ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as {
        records?: {
          Id: string;
          FirstName?: string | null;
          LastName?: string | null;
          Email?: string | null;
          Phone?: string | null;
          Title?: string | null;
          Account?: { Name?: string | null } | null;
        }[];
        nextRecordsUrl?: string | null;
        done?: boolean;
      };
      for (const r of data.records ?? []) {
        out.push({
          externalId: r.Id,
          firstName: str(r.FirstName),
          lastName: str(r.LastName),
          email: str(r.Email),
          phone: str(r.Phone),
          title: str(r.Title),
          companyName: str(r.Account?.Name),
        });
      }
      next = data.done === false ? data.nextRecordsUrl ?? null : null;
    }
    return out.slice(0, MAX_CONTACTS);
  }
}

// ---- Zoho CRM ---------------------------------------------------------------

class ZohoProvider implements CrmProvider {
  readonly type = "zoho" as const;
  readonly mode = "live" as const;
  constructor(private apiDomain: string, private token: string) {}

  async fetchContacts(): Promise<CrmContact[]> {
    const base = this.apiDomain.replace(/\/+$/, "");
    const fields = ["First_Name", "Last_Name", "Email", "Phone", "Title", "Account_Name"];
    const out: CrmContact[] = [];
    let pageToken: string | undefined;
    let page = 1;

    while (out.length < MAX_CONTACTS) {
      const url = new URL(`${base}/crm/v5/Contacts`);
      url.searchParams.set("fields", fields.join(","));
      url.searchParams.set("per_page", String(PAGE));
      if (pageToken) url.searchParams.set("page_token", pageToken);
      else url.searchParams.set("page", String(page));

      const res = await fetch(url, {
        headers: { authorization: `Zoho-oauthtoken ${this.token}` },
      });
      if (res.status === 204) break; // Zoho: no records on this page
      if (!res.ok) throw new Error(`Zoho API ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as {
        data?: {
          id: string;
          First_Name?: string | null;
          Last_Name?: string | null;
          Email?: string | null;
          Phone?: string | null;
          Title?: string | null;
          Account_Name?: { name?: string | null } | string | null;
        }[];
        info?: { more_records?: boolean; next_page_token?: string | null };
      };
      for (const r of data.data ?? []) {
        const account =
          typeof r.Account_Name === "string"
            ? r.Account_Name
            : r.Account_Name?.name ?? null;
        out.push({
          externalId: r.id,
          firstName: str(r.First_Name),
          lastName: str(r.Last_Name),
          email: str(r.Email),
          phone: str(r.Phone),
          title: str(r.Title),
          companyName: str(account),
        });
      }
      const info = data.info;
      if (!info?.more_records) break;
      pageToken = info.next_page_token ?? undefined;
      page += 1;
    }
    return out.slice(0, MAX_CONTACTS);
  }
}

// ============================================================================
// OAuth-auth providers (field-service platforms)
// ============================================================================

// ---- Jobber (GraphQL) -------------------------------------------------------

class JobberProvider implements CrmProvider {
  readonly type = "jobber" as const;
  readonly mode = "live" as const;
  constructor(private conn: LiveConnection) {}

  async fetchContacts(): Promise<CrmContact[]> {
    const query = `
      query Clients($after: String) {
        clients(first: ${PAGE}, after: $after) {
          nodes {
            id firstName lastName companyName
            emails { address primary }
            phones { number primary }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`;
    const out: CrmContact[] = [];
    let after: string | null = null;

    while (out.length < MAX_CONTACTS) {
      const res = await fetch("https://api.getjobber.com/api/graphql", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.conn.accessToken}`,
          "content-type": "application/json",
          "X-JOBBER-GRAPHQL-VERSION": "2023-11-15",
        },
        body: JSON.stringify({ query, variables: { after } }),
      });
      if (!res.ok) throw new Error(`Jobber API ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as {
        errors?: { message: string }[];
        data?: {
          clients?: {
            nodes?: {
              id: string;
              firstName?: string | null;
              lastName?: string | null;
              companyName?: string | null;
              emails?: { address?: string; primary?: boolean }[];
              phones?: { number?: string; primary?: boolean }[];
            }[];
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          };
        };
      };
      if (json.errors?.length) throw new Error(`Jobber API: ${json.errors[0].message}`);
      const conn = json.data?.clients;
      for (const c of conn?.nodes ?? []) {
        const email = (c.emails?.find((e) => e.primary) ?? c.emails?.[0])?.address;
        const phone = (c.phones?.find((p) => p.primary) ?? c.phones?.[0])?.number;
        out.push({
          externalId: c.id,
          firstName: str(c.firstName),
          lastName: str(c.lastName),
          email: str(email),
          phone: str(phone),
          title: null,
          companyName: str(c.companyName),
        });
      }
      if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
      after = conn.pageInfo.endCursor;
    }
    return out.slice(0, MAX_CONTACTS);
  }
}

// ---- Housecall Pro (REST) ---------------------------------------------------

class HousecallProvider implements CrmProvider {
  readonly type = "housecall" as const;
  readonly mode = "live" as const;
  constructor(private conn: LiveConnection) {}

  async fetchContacts(): Promise<CrmContact[]> {
    const out: CrmContact[] = [];
    let page = 1;

    while (out.length < MAX_CONTACTS) {
      const url = new URL("https://api.housecallpro.com/customers");
      url.searchParams.set("page", String(page));
      url.searchParams.set("page_size", String(PAGE));

      const res = await fetch(url, {
        headers: { authorization: `Bearer ${this.conn.accessToken}` },
      });
      if (!res.ok) throw new Error(`Housecall Pro API ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as {
        customers?: {
          id: string;
          first_name?: string | null;
          last_name?: string | null;
          email?: string | null;
          mobile_number?: string | null;
          home_number?: string | null;
          company?: string | null;
        }[];
      };
      const rows = data.customers ?? [];
      for (const c of rows) {
        out.push({
          externalId: c.id,
          firstName: str(c.first_name),
          lastName: str(c.last_name),
          email: str(c.email),
          phone: str(c.mobile_number) ?? str(c.home_number),
          title: null,
          companyName: str(c.company),
        });
      }
      if (rows.length < PAGE) break;
      page += 1;
    }
    return out.slice(0, MAX_CONTACTS);
  }
}

// ---- ServiceTitan (REST) ----------------------------------------------------

class ServiceTitanProvider implements CrmProvider {
  readonly type = "servicetitan" as const;
  readonly mode = "live" as const;
  constructor(private conn: LiveConnection) {}

  async fetchContacts(): Promise<CrmContact[]> {
    const tenant = this.conn.tenantId;
    if (!tenant) throw new Error("ServiceTitan connection is missing a tenant id.");
    const appKey = process.env.SERVICETITAN_APP_KEY;
    if (!appKey) throw new Error("SERVICETITAN_APP_KEY is not configured.");
    const base = (this.conn.instanceUrl ?? "https://api.servicetitan.io").replace(/\/+$/, "");

    const out: CrmContact[] = [];
    let page = 1;

    while (out.length < MAX_CONTACTS) {
      const url = new URL(`${base}/crm/v2/tenant/${tenant}/customers`);
      url.searchParams.set("page", String(page));
      url.searchParams.set("pageSize", String(PAGE));

      const res = await fetch(url, {
        headers: {
          authorization: `Bearer ${this.conn.accessToken}`,
          "ST-App-Key": appKey,
        },
      });
      if (!res.ok) throw new Error(`ServiceTitan API ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as {
        data?: { id: number; name?: string | null; email?: string | null; phoneNumber?: string | null }[];
        hasMore?: boolean;
      };
      for (const c of data.data ?? []) {
        const { first, last } = splitName(c.name ?? null);
        out.push({
          externalId: String(c.id),
          firstName: first,
          lastName: last,
          email: str(c.email),
          phone: str(c.phoneNumber),
          title: null,
          companyName: str(c.name),
        });
      }
      if (!data.hasMore) break;
      page += 1;
    }
    return out.slice(0, MAX_CONTACTS);
  }
}

// ---- QuickBooks Online (Query API) ------------------------------------------

class QuickBooksProvider implements CrmProvider {
  readonly type = "quickbooks" as const;
  readonly mode = "live" as const;
  constructor(private conn: LiveConnection) {}

  async fetchContacts(): Promise<CrmContact[]> {
    const realm = this.conn.realmId;
    if (!realm) throw new Error("QuickBooks connection is missing a company (realm) id.");
    const base = (this.conn.instanceUrl ?? "https://quickbooks.api.intuit.com").replace(/\/+$/, "");

    const out: CrmContact[] = [];
    let start = 1; // QuickBooks STARTPOSITION is 1-based

    while (out.length < MAX_CONTACTS) {
      const soql = `SELECT * FROM Customer STARTPOSITION ${start} MAXRESULTS ${PAGE}`;
      const url = new URL(`${base}/v3/company/${realm}/query`);
      url.searchParams.set("query", soql);
      url.searchParams.set("minorversion", "65");

      const res = await fetch(url, {
        headers: {
          authorization: `Bearer ${this.conn.accessToken}`,
          accept: "application/json",
        },
      });
      if (!res.ok) throw new Error(`QuickBooks API ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as {
        QueryResponse?: {
          Customer?: {
            Id: string;
            GivenName?: string | null;
            FamilyName?: string | null;
            DisplayName?: string | null;
            CompanyName?: string | null;
            PrimaryEmailAddr?: { Address?: string | null } | null;
            PrimaryPhone?: { FreeFormNumber?: string | null } | null;
          }[];
        };
      };
      const rows = data.QueryResponse?.Customer ?? [];
      for (const c of rows) {
        const first = str(c.GivenName);
        const last = str(c.FamilyName);
        const fallback = !first && !last ? splitName(c.DisplayName ?? null) : null;
        out.push({
          externalId: c.Id,
          firstName: first ?? fallback?.first ?? null,
          lastName: last ?? fallback?.last ?? null,
          email: str(c.PrimaryEmailAddr?.Address),
          phone: str(c.PrimaryPhone?.FreeFormNumber),
          title: null,
          companyName: str(c.CompanyName),
        });
      }
      if (rows.length < PAGE) break;
      start += PAGE;
    }
    return out.slice(0, MAX_CONTACTS);
  }
}

// ---- Factory ----------------------------------------------------------------

function tokenProvider(type: CrmProviderType, f: Record<string, string>): CrmProvider | null {
  switch (type) {
    case "hubspot":
      return new HubSpotProvider(f.api_token);
    case "pipedrive":
      return new PipedriveProvider(f.company_domain, f.api_token);
    case "salesforce":
      return new SalesforceProvider(f.instance_url, f.access_token);
    case "zoho":
      return new ZohoProvider(f.api_domain, f.access_token);
    default:
      return null;
  }
}

function oauthProvider(type: CrmProviderType, conn: LiveConnection): CrmProvider | null {
  switch (type) {
    case "jobber":
      return new JobberProvider(conn);
    case "housecall":
      return new HousecallProvider(conn);
    case "servicetitan":
      return new ServiceTitanProvider(conn);
    case "quickbooks":
      return new QuickBooksProvider(conn);
    default:
      return null;
  }
}

/**
 * Resolve a provider for an org's stored connection. Runs live when the config
 * carries usable credentials for the provider's auth style, otherwise returns a
 * deterministic mock keyed by `seed` (typically the org id).
 */
export function getCrmProvider(
  type: CrmProviderType,
  config: CrmConnectionConfig | null,
  seed: string,
): CrmProvider {
  if (config?.mock) return new MockCrmProvider(type, seed);
  const meta = crmMeta(type);
  if (meta.auth === "oauth") {
    const conn = readLiveConnection(config);
    return (conn && oauthProvider(type, conn)) ?? new MockCrmProvider(type, seed);
  }
  const fields = readTokenFields(type, config);
  return (fields && tokenProvider(type, fields)) ?? new MockCrmProvider(type, seed);
}
