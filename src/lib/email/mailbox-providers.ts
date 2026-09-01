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

/**
 * The provider's own daily sending quota, which our internal cap has to sit
 * underneath. Gmail and Graph enforce these by REJECTING messages, so a mailbox
 * allowed to send right up to the ceiling fails mid-sequence — the contact
 * never gets the email. Two tiers because both providers give a free/personal
 * account a far smaller allowance than a paid business one.
 */
export type MailboxSendQuota = {
  /** Hard daily ceiling on a free/personal account (e.g. @gmail.com). */
  personalCeiling: number;
  /** Hard daily ceiling on a business/workspace account (custom domain). */
  businessCeiling: number;
  /** Address domains that identify a free/personal account of this provider. */
  personalDomains: string[];
};

export type MailboxProviderMeta = {
  type: MailboxProviderType;
  label: string;
  /** One-liner shown on the settings card. */
  description: string;
  oauth: MailboxOAuthMeta;
  /** Tailwind chip classes for the card icon, to match the other cards. */
  chip: string;
  /** Provider-enforced daily send quota; see MailboxSendQuota. */
  quota: MailboxSendQuota;
  /**
   * Whether the connect flow is advertised in Settings. A provider set to false
   * keeps every part of its implementation live — OAuth routes, token refresh,
   * sending — so a mailbox already connected through it goes on working; it is
   * simply not offered to new users. Flip to true to re-enable it.
   */
  offered: boolean;
};

export const MAILBOX_PROVIDERS: MailboxProviderMeta[] = [
  {
    type: "gmail",
    label: "Gmail",
    description: "Send campaigns and replies from your Gmail or Google Workspace account.",
    chip: "bg-red-500/15 text-red-600 dark:text-red-400",
    // Google: 500 messages/day on a free account, 2,000 on Workspace.
    quota: {
      personalCeiling: 500,
      businessCeiling: 2000,
      personalDomains: ["gmail.com", "googlemail.com"],
    },
    offered: true,
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
    // Outlook.com: 300 recipients/day. Microsoft 365 allows far more (10,000)
    // but throttles to 30 messages/minute, and a bulk run through a business
    // mailbox is a reputation risk long before it is a quota one — so the
    // business tier is held at a deliberately conservative 2,000.
    quota: {
      personalCeiling: 300,
      businessCeiling: 2000,
      personalDomains: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
    },
    // Held back: Gmail ships first. The Azure app isn't registered yet, and an
    // "Connect Outlook" button that 302s to a not_configured error is worse
    // than no button. Sending from an Outlook mailbox is unaffected.
    offered: false,
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

/** Providers currently advertised for connecting. See `offered`. */
export function offeredMailboxProviders(): MailboxProviderMeta[] {
  return MAILBOX_PROVIDERS.filter((p) => p.offered);
}

export function mailboxProviderMeta(type: MailboxProviderType): MailboxProviderMeta {
  const meta = MAILBOX_PROVIDERS.find((p) => p.type === type);
  if (!meta) throw new Error(`Unknown mailbox provider: ${type}`);
  return meta;
}

export function mailboxProviderLabel(type: string): string {
  return MAILBOX_PROVIDERS.find((p) => p.type === type)?.label ?? type;
}

/** True when `email` is on one of the provider's free/personal domains. */
export function isPersonalAccount(type: MailboxProviderType, email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return mailboxProviderMeta(type).quota.personalDomains.includes(domain);
}

/**
 * The highest daily cap we will let a connected mailbox be set to — the
 * provider's own ceiling. Above it the provider starts rejecting sends, which
 * our cap exists to prevent, so the settings form clamps to this.
 */
export function dailyLimitCeiling(type: MailboxProviderType, email: string): number {
  const { quota } = mailboxProviderMeta(type);
  return isPersonalAccount(type, email) ? quota.personalCeiling : quota.businessCeiling;
}

/**
 * The cap a freshly connected mailbox starts on: 80% of the provider ceiling.
 *
 * Not the ceiling itself, for two reasons. The provider's published quota is
 * approximate and enforced on a rolling window, so sending exactly to it draws
 * rejections; and a brand-new sending identity that immediately runs at maximum
 * volume is the classic spam signature. Headroom also leaves room for the
 * replies a person types by hand, which count against the same quota.
 */
export function defaultDailyLimit(type: MailboxProviderType, email: string): number {
  return Math.floor(dailyLimitCeiling(type, email) * 0.8);
}
