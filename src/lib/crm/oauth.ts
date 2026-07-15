// OAuth 2.0 authorization-code token exchange + refresh for the oauth-style CRM
// connectors. Server-only (uses the client secret). Provider quirks live here so
// the routes and the sync engine share one implementation.

import { crmMeta, type CrmProviderType } from "./providers";
import type { OAuthClient } from "./connection";

export type TokenResult = {
  accessToken: string;
  refreshToken: string | null;
  expiresInSec: number | null;
};

/** Providers that authenticate the token request with HTTP Basic (client:secret). */
const BASIC_AUTH: ReadonlySet<CrmProviderType> = new Set(["quickbooks"]);

function oauthMeta(type: CrmProviderType) {
  const meta = crmMeta(type);
  if (meta.auth !== "oauth" || !meta.oauth)
    throw new Error(`${meta.label} is not an OAuth provider.`);
  return meta.oauth;
}

function tokenRequest(
  type: CrmProviderType,
  client: OAuthClient,
  body: Record<string, string>,
): { url: string; headers: Record<string, string>; body: URLSearchParams } {
  const oauth = oauthMeta(type);
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  const params = new URLSearchParams(body);
  if (BASIC_AUTH.has(type)) {
    const basic = Buffer.from(`${client.id}:${client.secret}`).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  } else {
    params.set("client_id", client.id);
    params.set("client_secret", client.secret);
  }
  return { url: oauth.tokenUrl, headers, body: params };
}

async function postToken(
  url: string,
  headers: Record<string, string>,
  body: URLSearchParams,
): Promise<TokenResult> {
  const res = await fetch(url, { method: "POST", headers, body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token endpoint ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) throw new Error("Token response had no access_token.");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresInSec: typeof data.expires_in === "number" ? data.expires_in : null,
  };
}

/** Exchange an authorization code for tokens after the OAuth redirect. */
export async function exchangeCode(args: {
  type: CrmProviderType;
  code: string;
  redirectUri: string;
  client: OAuthClient;
}): Promise<TokenResult> {
  const { url, headers, body } = tokenRequest(args.type, args.client, {
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
  });
  return postToken(url, headers, body);
}

/** Exchange a refresh token for a fresh access token. */
export async function refreshTokens(args: {
  type: CrmProviderType;
  refreshToken: string;
  client: OAuthClient;
}): Promise<TokenResult> {
  const { url, headers, body } = tokenRequest(args.type, args.client, {
    grant_type: "refresh_token",
    refresh_token: args.refreshToken,
  });
  const result = await postToken(url, headers, body);
  // Some providers omit refresh_token on refresh — keep the existing one.
  if (!result.refreshToken) result.refreshToken = args.refreshToken;
  return result;
}

/** Build the provider authorize URL the user is redirected to. */
export function authorizeUrl(args: {
  type: CrmProviderType;
  client: OAuthClient;
  redirectUri: string;
  state: string;
}): string {
  const oauth = oauthMeta(args.type);
  const u = new URL(oauth.authorizeUrl);
  u.searchParams.set("client_id", args.client.id);
  u.searchParams.set("redirect_uri", args.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", oauth.scope);
  u.searchParams.set("state", args.state);
  return u.toString();
}
