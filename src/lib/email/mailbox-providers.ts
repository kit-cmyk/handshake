// Registry of the email accounts a user can connect as a sending mailbox, and
// how each authenticates. Mirrors src/lib/crm/providers.ts: kept free of any
// Node/fetch/secret code so it can be imported by both the client settings UI
// and server code. Server code reads the named env vars to decide whether the
// live connect flow is available.

export const MAILBOX_PROVIDER_TYPES = ["gmail", "outlook"] as const;

export type MailboxProviderType = (typeof MAILBOX_PROVIDER_TYPES)[number];

export function isMailboxProviderType(v: unknown): v is MailboxProviderType {
  return (
    typeof v === "string" &&
    (MAILBOX_PROVIDER_TYPES as readonly string[]).includes(v)
  );
}

/** OAuth 2.0 endpoints + the env vars holding the client credentials. */
export type MailboxOAuthMeta = {
  authorizeUrl: string;
  tokenUrl: string;
  /** Space-delimited scopes. Includes the send scope + enough to read the address. */
  scope: string;
  /** Extra authorize-request params (e.g. Google's offline/consent). */
  authorizeParams?: Record<string, string>;
  clientIdEnv: string;
  clientSecretEnv: string;
};

export type MailboxProviderMeta = {
  type: MailboxProviderType;
  label: string;
  /** One-liner shown on the settings card. */
  description: string;
  oauth: MailboxOAuthMeta;
  /** Tailwind chip classes for the card icon, to match the other cards. */
  chip: string;
};

export const MAILBOX_PROVIDERS: MailboxProviderMeta[] = [
  {
    type: "gmail",
    label: "Gmail",
    description: "Send campaigns and replies from your Gmail or Google Workspace account.",
    chip: "bg-red-500/15 text-red-600 dark:text-red-400",
    oauth: {
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scope: "openid email https://www.googleapis.com/auth/gmail.send",
      // access_type=offline + prompt=consent are required to reliably receive a
      // refresh_token (Google only returns one on the first consent otherwise).
      authorizeParams: { access_type: "offline", prompt: "consent" },
      clientIdEnv: "GOOGLE_MAILBOX_CLIENT_ID",
      clientSecretEnv: "GOOGLE_MAILBOX_CLIENT_SECRET",
    },
  },
  {
    type: "outlook",
    label: "Outlook",
    description: "Send from your Outlook.com or Microsoft 365 account.",
    chip: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    oauth: {
      authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      // offline_access → refresh token; Mail.Send → send; openid/email → address.
      scope:
        "openid email offline_access https://graph.microsoft.com/Mail.Send",
      authorizeParams: { prompt: "consent" },
      clientIdEnv: "MICROSOFT_CLIENT_ID",
      clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
    },
  },
];

export function mailboxProviderMeta(type: MailboxProviderType): MailboxProviderMeta {
  const meta = MAILBOX_PROVIDERS.find((p) => p.type === type);
  if (!meta) throw new Error(`Unknown mailbox provider: ${type}`);
  return meta;
}

export function mailboxProviderLabel(type: string): string {
  return MAILBOX_PROVIDERS.find((p) => p.type === type)?.label ?? type;
}
