// CRM connector registry — the source of truth for which CRMs Handshake can
// pull contacts from, how each authenticates, and what config fields the
// connect form collects. Kept free of any Node/fetch code so it can be imported
// by both the client settings UI and server code.
//
// Two auth styles:
//   - "token": the user pastes an API token/credentials (HubSpot, Pipedrive,
//     Salesforce, Zoho). Collected via `fields`.
//   - "oauth": an OAuth 2.0 authorization-code redirect flow (Jobber, Housecall
//     Pro, ServiceTitan, QuickBooks). Uses `oauth` endpoints; secrets are never
//     read here — server code checks the named env vars to decide live vs mock.

export const CRM_PROVIDERS_TYPES = [
  "hubspot",
  "pipedrive",
  "salesforce",
  "zoho",
  "jobber",
  "housecall",
  "servicetitan",
  "quickbooks",
] as const;

export type CrmProviderType = (typeof CRM_PROVIDERS_TYPES)[number];

export function isCrmProviderType(v: unknown): v is CrmProviderType {
  return (
    typeof v === "string" &&
    (CRM_PROVIDERS_TYPES as readonly string[]).includes(v)
  );
}

/** A credential field the connect dialog collects for a token-based CRM. */
export type CrmField = {
  key: string;
  label: string;
  placeholder?: string;
  hint?: string;
  /** Rendered as a password input and never echoed back to the client. */
  secret?: boolean;
  optional?: boolean;
};

/** OAuth 2.0 endpoints + the env vars holding the client credentials. */
export type OAuthMeta = {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientIdEnv: string;
  clientSecretEnv: string;
};

export type CrmProviderMeta = {
  type: CrmProviderType;
  label: string;
  /** How the user connects: paste a token, or an OAuth redirect. */
  auth: "token" | "oauth";
  /** One-liner shown on the settings card. */
  description: string;
  /** Where to find the credential / set up the OAuth app. */
  docsUrl: string;
  /** Credential fields collected by the connect form (token auth only). */
  fields: CrmField[];
  /** OAuth endpoints + client env var names (oauth auth only). */
  oauth?: OAuthMeta;
  /** Tailwind chip classes for the card icon, to match the Slack/email cards. */
  chip: string;
};

export const CRM_PROVIDERS: CrmProviderMeta[] = [
  {
    type: "hubspot",
    label: "HubSpot",
    auth: "token",
    description: "Pull your HubSpot contacts into Handshake and keep them fresh.",
    docsUrl:
      "https://developers.hubspot.com/docs/api/private-apps",
    chip: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    fields: [
      {
        key: "api_token",
        label: "Private app access token",
        placeholder: "pat-na1-…",
        hint: "HubSpot → Settings → Integrations → Private Apps. Needs the crm.objects.contacts.read scope.",
        secret: true,
      },
    ],
  },
  {
    type: "pipedrive",
    label: "Pipedrive",
    auth: "token",
    description: "Sync your Pipedrive people and their organizations.",
    docsUrl:
      "https://pipedrive.readme.io/docs/how-to-find-the-api-token",
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    fields: [
      {
        key: "company_domain",
        label: "Company domain",
        placeholder: "acme",
        hint: "The subdomain in your Pipedrive URL: https://<domain>.pipedrive.com.",
      },
      {
        key: "api_token",
        label: "API token",
        placeholder: "…",
        hint: "Pipedrive → Settings → Personal preferences → API.",
        secret: true,
      },
    ],
  },
  {
    type: "salesforce",
    label: "Salesforce",
    auth: "token",
    description: "Import Salesforce Contacts via the REST API.",
    docsUrl:
      "https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_understanding_authentication.htm",
    chip: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    fields: [
      {
        key: "instance_url",
        label: "Instance URL",
        placeholder: "https://acme.my.salesforce.com",
        hint: "Your Salesforce org's My Domain / instance URL.",
      },
      {
        key: "access_token",
        label: "OAuth access token",
        placeholder: "00D…",
        hint: "A valid OAuth 2.0 access token (session id) with API access.",
        secret: true,
      },
    ],
  },
  {
    type: "zoho",
    label: "Zoho CRM",
    auth: "token",
    description: "Import contacts from Zoho CRM.",
    docsUrl: "https://www.zoho.com/crm/developer/docs/api/v5/access-refresh.html",
    chip: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    fields: [
      {
        key: "api_domain",
        label: "API domain",
        placeholder: "https://www.zohoapis.com",
        hint: "Data-center specific: .com, .eu, .in, .com.au, etc.",
      },
      {
        key: "access_token",
        label: "OAuth access token",
        placeholder: "1000.…",
        hint: "A valid Zoho OAuth access token with ZohoCRM.modules.contacts.READ.",
        secret: true,
      },
    ],
  },
  {
    type: "jobber",
    label: "Jobber",
    auth: "oauth",
    description: "Sync your Jobber clients into Handshake and keep contacts fresh.",
    docsUrl:
      "https://developer.getjobber.com/docs/build_with_jobber/app_authorization/",
    chip: "bg-green-500/15 text-green-600 dark:text-green-400",
    fields: [],
    oauth: {
      authorizeUrl: "https://api.getjobber.com/api/oauth/authorize",
      tokenUrl: "https://api.getjobber.com/api/oauth/token",
      scope: "read_clients",
      clientIdEnv: "JOBBER_CLIENT_ID",
      clientSecretEnv: "JOBBER_CLIENT_SECRET",
    },
  },
  {
    type: "housecall",
    label: "Housecall Pro",
    auth: "oauth",
    description: "Import your Housecall Pro customers as contacts.",
    docsUrl: "https://docs.housecallpro.com/docs/housecall-public-api/",
    chip: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    fields: [],
    oauth: {
      authorizeUrl: "https://api.housecallpro.com/oauth/authorize",
      tokenUrl: "https://api.housecallpro.com/oauth/token",
      scope: "read",
      clientIdEnv: "HOUSECALL_CLIENT_ID",
      clientSecretEnv: "HOUSECALL_CLIENT_SECRET",
    },
  },
  {
    type: "servicetitan",
    label: "ServiceTitan",
    auth: "oauth",
    description: "Pull ServiceTitan customer contacts into your pipeline.",
    docsUrl: "https://developer.servicetitan.io/docs/oauth/",
    chip: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
    fields: [],
    oauth: {
      authorizeUrl: "https://auth.servicetitan.io/connect/authorize",
      tokenUrl: "https://auth.servicetitan.io/connect/token",
      scope: "offline_access",
      clientIdEnv: "SERVICETITAN_CLIENT_ID",
      clientSecretEnv: "SERVICETITAN_CLIENT_SECRET",
    },
  },
  {
    type: "quickbooks",
    label: "QuickBooks",
    auth: "oauth",
    description: "Sync QuickBooks Online customers into Handshake contacts.",
    docsUrl:
      "https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0",
    chip: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
    fields: [],
    oauth: {
      authorizeUrl: "https://appcenter.intuit.com/connect/oauth2",
      tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      scope: "com.intuit.quickbooks.accounting",
      clientIdEnv: "QUICKBOOKS_CLIENT_ID",
      clientSecretEnv: "QUICKBOOKS_CLIENT_SECRET",
    },
  },
];

export function crmMeta(type: CrmProviderType): CrmProviderMeta {
  const meta = CRM_PROVIDERS.find((p) => p.type === type);
  if (!meta) throw new Error(`Unknown CRM provider: ${type}`);
  return meta;
}

export function crmLabel(type: CrmProviderType): string {
  return CRM_PROVIDERS.find((p) => p.type === type)?.label ?? type;
}
