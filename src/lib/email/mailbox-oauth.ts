// OAuth 2.0 authorization-code exchange + refresh for connectable sending
// mailboxes (Gmail, Outlook), plus resolving the authenticated account address.
// Server-only (uses the client secret). Mirrors src/lib/crm/oauth.ts; provider
// quirks live here so the routes and the send engine share one implementation.

import {
  mailboxProviderMeta,
  type MailboxProviderType,
} from "./mailbox-providers";

export type OAuthClient = { id: string; secret: string };

export type MailboxTokenResult = {
  accessToken: string;
  refreshToken: string | null;
  expiresInSec: number | null;
};

/**
 * OAuth client credentials for a provider, or null when the app isn't configured.
 * Null means the connect flow can't run — the UI hides/disables the button.
 */
export function mailboxOAuthClient(type: MailboxProviderType): OAuthClient | null {
  const { oauth } = mailboxProviderMeta(type);
  const id = process.env[oauth.clientIdEnv];
  const secret = process.env[oauth.clientSecretEnv];
  return id && secret ? { id, secret } : null;
}

/** Whether the live connect path is available (client env vars set). */
export function isMailboxProviderConfigured(type: MailboxProviderType): boolean {
  return mailboxOAuthClient(type) !== null;
}

/** Build the provider authorize URL the user is redirected to. */
export function authorizeUrl(args: {
  type: MailboxProviderType;
  client: OAuthClient;
  redirectUri: string;
  state: string;
}): string {
  const { oauth } = mailboxProviderMeta(args.type);
  const u = new URL(oauth.authorizeUrl);
  u.searchParams.set("client_id", args.client.id);
  u.searchParams.set("redirect_uri", args.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", oauth.scope);
  u.searchParams.set("state", args.state);
  for (const [k, v] of Object.entries(oauth.authorizeParams ?? {}))
    u.searchParams.set(k, v);
  return u.toString();
}

async function postToken(
  type: MailboxProviderType,
  client: OAuthClient,
  extra: Record<string, string>,
): Promise<MailboxTokenResult> {
  const { oauth } = mailboxProviderMeta(type);
  const params = new URLSearchParams({
    client_id: client.id,
    client_secret: client.secret,
    ...extra,
  });
  const res = await fetch(oauth.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params,
  });
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
  type: MailboxProviderType;
  code: string;
  redirectUri: string;
  client: OAuthClient;
}): Promise<MailboxTokenResult> {
  return postToken(args.type, args.client, {
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
  });
}

/** Exchange a refresh token for a fresh access token. */
export async function refreshTokens(args: {
  type: MailboxProviderType;
  refreshToken: string;
  client: OAuthClient;
}): Promise<MailboxTokenResult> {
  const result = await postToken(args.type, args.client, {
    grant_type: "refresh_token",
    refresh_token: args.refreshToken,
  });
  // Providers often omit refresh_token on refresh — keep the existing one.
  if (!result.refreshToken) result.refreshToken = args.refreshToken;
  return result;
}

/**
 * Resolve the authenticated account's email address using the fresh access
 * token. This becomes the mailbox's authoritative "from" — Gmail and Graph both
 * reject sending as any other address.
 */
export async function fetchAccountEmail(
  type: MailboxProviderType,
  accessToken: string,
): Promise<string> {
  const auth = { Authorization: `Bearer ${accessToken}` };
  if (type === "gmail") {
    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      { headers: auth },
    );
    if (!res.ok) throw new Error(`Gmail profile ${res.status}`);
    const data = (await res.json()) as { emailAddress?: string };
    if (!data.emailAddress) throw new Error("Gmail profile had no emailAddress.");
    return data.emailAddress;
  }
  // outlook
  const res = await fetch("https://graph.microsoft.com/v1.0/me", { headers: auth });
  if (!res.ok) throw new Error(`Graph /me ${res.status}`);
  const data = (await res.json()) as {
    mail?: string | null;
    userPrincipalName?: string | null;
  };
  const email = data.mail ?? data.userPrincipalName;
  if (!email) throw new Error("Graph /me had no mail/userPrincipalName.");
  return email;
}
