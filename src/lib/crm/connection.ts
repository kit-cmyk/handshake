// Server-only helpers around a stored CRM connection: what lives in
// org_integrations.config, how OAuth client credentials are read from the
// environment, and how secrets are encrypted going in / decrypted coming out.
// Never import into client code (reads secrets + node:crypto via ./crypto).
//
// The registry (providers.ts) marks each CRM as `auth: "token"` or
// `auth: "oauth"`; this module handles both:
//   - token: the user's pasted field values live in `config.fields`; secret
//     fields are stored ENCRYPTED, non-secret ones in the clear.
//   - oauth: the exchanged access/refresh tokens live in `config.oauth`, both
//     ENCRYPTED, plus any provider scoping ids (realm/tenant/instance).

import { encryptSecret, decryptSecret } from "./crypto";
import { crmMeta, type CrmProviderType } from "./providers";

/** OAuth token set as stored in config (access/refresh are ENCRYPTED strings). */
export type StoredOAuth = {
  access_token: string; // encrypted
  refresh_token?: string; // encrypted
  expires_at?: string; // ISO; when the access token stops working
};

/** Shape of org_integrations.config for a CRM connection. */
export type CrmConnectionConfig = {
  /** Dev/no-credentials mode: sync produces deterministic sample contacts. */
  mock?: boolean;
  /** token auth: field key → value (secret values encrypted). */
  fields?: Record<string, string>;
  /** oauth auth: encrypted token set. */
  oauth?: StoredOAuth;
  /** QuickBooks company id, returned as `realmId` on the OAuth callback. */
  realm_id?: string;
  /** ServiceTitan tenant id the connection is scoped to. */
  tenant_id?: string;
  /** Provider API base when it varies per connection. */
  instance_url?: string;
};

/** Decrypted, ready-to-use OAuth token set + connection metadata. */
export type LiveConnection = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  realmId: string | null;
  tenantId: string | null;
  instanceUrl: string | null;
};

export type OAuthClient = { id: string; secret: string };

// ---- OAuth client credentials (env) -----------------------------------------

/**
 * OAuth client credentials for an oauth-style provider, or null when the app
 * isn't configured (or the provider is token-auth). Null means the OAuth
 * connect flow can't run live — the UI offers demo mode instead.
 */
export function oauthClient(type: CrmProviderType): OAuthClient | null {
  const meta = crmMeta(type);
  if (meta.auth !== "oauth" || !meta.oauth) return null;
  const id = process.env[meta.oauth.clientIdEnv];
  const secret = process.env[meta.oauth.clientSecretEnv];
  return id && secret ? { id, secret } : null;
}

/**
 * Whether the live connect path is available for a provider. Token providers
 * always are (the user just pastes credentials); OAuth providers require the
 * client app env vars to be set.
 */
export function isLiveConfigured(type: CrmProviderType): boolean {
  return crmMeta(type).auth === "token" ? true : oauthClient(type) !== null;
}

// ---- token auth -------------------------------------------------------------

/**
 * Encrypt secret field values for storage, merging over any existing config so
 * a blank secret field on re-edit keeps the stored value. Non-secret fields are
 * stored in the clear and can be cleared.
 */
export function buildTokenFields(
  type: CrmProviderType,
  input: Record<string, string>,
  existing: Record<string, string> = {},
): Record<string, string> {
  const meta = crmMeta(type);
  const out: Record<string, string> = { ...existing };
  for (const f of meta.fields) {
    const raw = (input[f.key] ?? "").trim();
    if (raw) out[f.key] = f.secret ? encryptSecret(raw) : raw;
    else if (!f.secret) out[f.key] = "";
    // secret left blank → keep any existing (encrypted) value
  }
  return out;
}

/**
 * Decrypt stored token fields into plain values. Returns null when a required
 * field is missing or won't decrypt — the caller then falls back to mock.
 */
export function readTokenFields(
  type: CrmProviderType,
  config: CrmConnectionConfig | null,
): Record<string, string> | null {
  const meta = crmMeta(type);
  if (meta.auth !== "token") return null;
  const stored = config?.fields ?? {};
  const out: Record<string, string> = {};
  for (const f of meta.fields) {
    const raw = stored[f.key];
    const value = raw ? (f.secret ? decryptSecret(raw) : raw) : null;
    if (value == null || value === "") {
      if (!f.optional) return null;
      continue;
    }
    out[f.key] = value;
  }
  return out;
}

/** Non-secret stored field values — safe to send to the client for prefill. */
export function publicTokenFields(
  type: CrmProviderType,
  config: CrmConnectionConfig | null,
): Record<string, string> {
  const meta = crmMeta(type);
  const stored = config?.fields ?? {};
  const out: Record<string, string> = {};
  for (const f of meta.fields)
    if (!f.secret && stored[f.key]) out[f.key] = stored[f.key];
  return out;
}

// ---- oauth auth -------------------------------------------------------------

/** Build the config to persist after a successful OAuth token exchange. */
export function buildOAuthConfig(
  tokens: {
    accessToken: string;
    refreshToken?: string | null;
    expiresInSec?: number | null;
  },
  extra: { realmId?: string; tenantId?: string; instanceUrl?: string },
  now: number,
): CrmConnectionConfig {
  const oauth: StoredOAuth = { access_token: encryptSecret(tokens.accessToken) };
  if (tokens.refreshToken) oauth.refresh_token = encryptSecret(tokens.refreshToken);
  if (tokens.expiresInSec)
    oauth.expires_at = new Date(now + tokens.expiresInSec * 1000).toISOString();
  return {
    oauth,
    ...(extra.realmId ? { realm_id: extra.realmId } : {}),
    ...(extra.tenantId ? { tenant_id: extra.tenantId } : {}),
    ...(extra.instanceUrl ? { instance_url: extra.instanceUrl } : {}),
  };
}

/** Decrypt a stored OAuth connection into usable tokens; null if not usable. */
export function readLiveConnection(
  config: CrmConnectionConfig | null,
): LiveConnection | null {
  const oauth = config?.oauth;
  if (!oauth?.access_token) return null;
  const accessToken = decryptSecret(oauth.access_token);
  if (!accessToken) return null;
  return {
    accessToken,
    refreshToken: oauth.refresh_token ? decryptSecret(oauth.refresh_token) : null,
    expiresAt: oauth.expires_at ?? null,
    realmId: config?.realm_id ?? null,
    tenantId: config?.tenant_id ?? null,
    instanceUrl: config?.instance_url ?? null,
  };
}

// ---- shared -----------------------------------------------------------------

/** Whether a stored connection currently holds usable live credentials. */
export function isConnectionLive(
  type: CrmProviderType,
  config: CrmConnectionConfig | null,
): boolean {
  if (!config || config.mock) return false;
  return crmMeta(type).auth === "oauth"
    ? readLiveConnection(config) !== null
    : readTokenFields(type, config) !== null;
}
