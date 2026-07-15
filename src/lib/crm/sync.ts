// The CRM sync engine — driven by the "Sync now" server action (org-scoped RLS
// client, with a user). Sync is manual for now; the engine takes any Supabase
// client so a scheduled cron can reuse it later. It refreshes the OAuth access
// token if it's near expiry, fetches contacts from the connector,
// resolves/creates their companies by name, upserts the contacts deduped by
// email, and records a `crm_sync_runs` row.
//
// Repeat-safe: contacts are matched by lower-cased email, so a second sync
// refreshes the same people instead of duplicating them. CRM contacts without
// an email can't be matched, so they're skipped rather than inserted every run.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCrmProvider, type CrmContact } from "./provider";
import {
  buildOAuthConfig,
  oauthClient,
  readLiveConnection,
  type CrmConnectionConfig,
} from "./connection";
import { refreshTokens } from "./oauth";
import type { CrmProviderType } from "./providers";

export type CrmSyncResult = {
  ok: boolean;
  error?: string;
  mode: "live" | "mock";
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  errored: number;
  /** Contacts touched (created or updated) — lets callers run a health check. */
  contactIds: string[];
};

const CHUNK = 500;
/** Refresh the access token this many ms before its stated expiry. */
const REFRESH_SKEW_MS = 60_000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Refresh the stored OAuth tokens when they're near expiry, persist the rotated
 * set, and return the config the provider should use. No-ops for mock
 * connections, connections without a refresh token, or when the OAuth app isn't
 * configured — the live fetch then either works on the current token or fails
 * loudly (and the failure is recorded on the run).
 */
async function ensureFreshConfig(
  client: SupabaseClient,
  orgId: string,
  type: CrmProviderType,
  config: CrmConnectionConfig,
): Promise<CrmConnectionConfig> {
  if (config.mock) return config;
  const conn = readLiveConnection(config);
  if (!conn) return config;
  const app = oauthClient(type);
  if (!app || !conn.refreshToken) return config;

  const expMs = conn.expiresAt ? Date.parse(conn.expiresAt) : NaN;
  if (Number.isFinite(expMs) && Date.now() < expMs - REFRESH_SKEW_MS) return config;

  try {
    const tokens = await refreshTokens({
      type,
      refreshToken: conn.refreshToken,
      client: app,
    });
    const next = buildOAuthConfig(
      tokens,
      {
        realmId: conn.realmId ?? undefined,
        tenantId: conn.tenantId ?? undefined,
        instanceUrl: conn.instanceUrl ?? undefined,
      },
      Date.now(),
    );
    await client
      .from("org_integrations")
      .update({ config: next })
      .eq("org_id", orgId)
      .eq("type", type);
    return next;
  } catch {
    // Leave the config as-is; the fetch below will surface the auth failure.
    return config;
  }
}

/** Update payload with only the fields the CRM actually provided (no clobber). */
function updatePayload(c: CrmContact, companyId: string | null) {
  const p: Record<string, unknown> = {};
  if (c.firstName) p.first_name = c.firstName;
  if (c.lastName) p.last_name = c.lastName;
  if (c.phone) p.phone = c.phone;
  if (c.title) p.title = c.title;
  if (companyId) p.company_id = companyId;
  return p;
}

export async function runCrmSync(
  client: SupabaseClient,
  opts: {
    orgId: string;
    userId: string | null;
    type: CrmProviderType;
    config: CrmConnectionConfig;
    trigger: "manual" | "scheduled";
  },
): Promise<CrmSyncResult> {
  const { orgId, userId, type, trigger } = opts;
  const config = await ensureFreshConfig(client, orgId, type, opts.config);
  const provider = getCrmProvider(type, config, orgId);
  const source = `crm:${type}`;
  const result: CrmSyncResult = {
    ok: false,
    mode: provider.mode,
    fetched: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errored: 0,
    contactIds: [],
  };

  // Open the run row up front so an in-progress / failed sync is still visible.
  const { data: run } = await client
    .from("crm_sync_runs")
    .insert({
      org_id: orgId,
      user_id: userId,
      provider: type,
      trigger,
      mode: provider.mode,
      status: "running",
    })
    .select("id")
    .single();
  const runId = run?.id as string | undefined;

  const finish = async (patch: Record<string, unknown>) => {
    if (runId) await client.from("crm_sync_runs").update(patch).eq("id", runId);
  };

  let contacts: CrmContact[];
  try {
    contacts = await provider.fetchContacts();
  } catch (e) {
    const error = e instanceof Error ? e.message : "Sync failed";
    await finish({
      status: "failed",
      error: error.slice(0, 500),
      completed_at: new Date().toISOString(),
    });
    return { ...result, error };
  }

  result.fetched = contacts.length;
  const touched = new Set<string>();

  // 1) Resolve / create companies referenced by name (same shape as CSV import).
  const companyByName = new Map<string, string>();
  const referenced = [
    ...new Set(
      contacts.map((c) => c.companyName?.trim()).filter((n): n is string => !!n),
    ),
  ];
  if (referenced.length) {
    const { data: existing } = await client
      .from("companies")
      .select("id, name")
      .eq("org_id", orgId);
    for (const c of existing ?? [])
      companyByName.set((c.name as string).toLowerCase(), c.id as string);

    const missing = referenced.filter((n) => !companyByName.has(n.toLowerCase()));
    if (missing.length) {
      const { data: made } = await client
        .from("companies")
        .insert(missing.map((n) => ({ org_id: orgId, name: n, source })))
        .select("id, name");
      for (const c of made ?? [])
        companyByName.set((c.name as string).toLowerCase(), c.id as string);
    }
  }

  // 2) Existing contacts keyed by email for dedupe.
  const emailToId = new Map<string, string>();
  const { data: existingContacts } = await client
    .from("contacts")
    .select("id, email")
    .eq("org_id", orgId)
    .not("email", "is", null);
  for (const c of existingContacts ?? [])
    emailToId.set((c.email as string).toLowerCase(), c.id as string);

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; payload: Record<string, unknown> }[] = [];

  for (const c of contacts) {
    const email = c.email?.toLowerCase() ?? null;
    // No email → can't dedupe; skip so repeat syncs don't pile up duplicates.
    if (!email) {
      result.skipped++;
      continue;
    }
    const companyId = c.companyName
      ? companyByName.get(c.companyName.toLowerCase()) ?? null
      : null;

    const existingId = emailToId.get(email);
    if (existingId) {
      touched.add(existingId);
      const payload = updatePayload(c, companyId);
      if (Object.keys(payload).length) toUpdate.push({ id: existingId, payload });
      else result.skipped++;
      continue;
    }

    toInsert.push({
      org_id: orgId,
      first_name: c.firstName,
      last_name: c.lastName,
      email: c.email,
      phone: c.phone,
      title: c.title,
      lifecycle_stage: "new",
      owner_id: userId,
      source,
      company_id: companyId,
    });
    // Guard against the same email appearing twice within one CRM payload.
    emailToId.set(email, "");
  }

  // 3) Apply inserts (chunked) then updates.
  for (const part of chunk(toInsert, CHUNK)) {
    const { data, error } = await client
      .from("contacts")
      .insert(part)
      .select("id");
    if (error) {
      result.errored += part.length;
    } else {
      const inserted = data ?? [];
      result.created += inserted.length;
      for (const row of inserted) touched.add((row as { id: string }).id);
    }
  }

  for (const u of toUpdate) {
    const { error } = await client
      .from("contacts")
      .update(u.payload)
      .eq("id", u.id);
    if (error) result.errored++;
    else result.updated++;
  }

  result.contactIds = [...touched];
  result.ok = true;

  await finish({
    status:
      result.errored > 0 && result.created + result.updated === 0
        ? "failed"
        : "completed",
    fetched: result.fetched,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    errored: result.errored,
    completed_at: new Date().toISOString(),
  });

  return result;
}
