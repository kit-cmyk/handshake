// Shared domain types mirroring supabase/migrations/0001_init.sql.
// (Hand-authored for now; can be replaced by generated Supabase types later.)

export const LIFECYCLE_STAGES = [
  "new",
  "contacted",
  "qualified",
  "won",
  "lost",
] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const LIFECYCLE_LABELS: Record<LifecycleStage, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
};

export const ACTIVITY_TYPES = [
  "note",
  "call",
  "task",
  "email",
  "appointment",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const DEAL_STATUSES = ["open", "won", "lost"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const DEAL_PRIORITIES = ["low", "medium", "high"] as const;
export type DealPriority = (typeof DEAL_PRIORITIES)[number];

export const DEAL_PRIORITY_LABELS: Record<DealPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export type Company = {
  id: string;
  org_id: string;
  name: string;
  category: string | null;
  industry: string | null;
  employee_count: number | null;
  annual_revenue: number | null;
  linkedin_url: string | null;
  domain: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  google_place_id: string | null;
  rating: number | null;
  latitude: number | null;
  longitude: number | null;
  source: string | null;
  created_at: string;
  updated_at: string;
};

export type Contact = {
  id: string;
  org_id: string;
  company_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  lifecycle_stage: LifecycleStage;
  owner_id: string | null;
  source: string | null;
  lead_source: string | null;
  /** Street line. */
  address: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  /** ISO date (YYYY-MM-DD); set post-creation, so absent on new contacts. */
  appointment_date: string | null;
  unsubscribed_at: string | null;
  /** Data-quality reasons the user has chosen to skip (see data-quality.ts). */
  dismissed_issues: string[];
  created_at: string;
  updated_at: string;
};

/** Contact joined with its company name for list views. */
export type ContactWithCompany = Contact & {
  companies: { id: string; name: string } | null;
};

export type Pipeline = { id: string; org_id: string; name: string };

export type Stage = {
  id: string;
  org_id: string;
  pipeline_id: string;
  name: string;
  position: number;
  /**
   * Contact lifecycle stage a deal on this stage pushes its contact to.
   * null = no mapping (the deal→lifecycle sync leaves the contact untouched).
   * Configurable per stage in Settings → Pipeline.
   */
  lifecycle_stage: LifecycleStage | null;
};

export type Deal = {
  id: string;
  org_id: string;
  contact_id: string | null;
  company_id: string | null;
  pipeline_id: string;
  stage_id: string;
  title: string;
  value: number | null;
  service: string | null;
  description: string | null;
  priority: DealPriority;
  status: DealStatus;
  close_date: string | null;
  created_at: string;
  updated_at: string;
};

export type DealWithRelations = Deal & {
  companies: { id: string; name: string } | null;
  contacts: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
};

export type Activity = {
  id: string;
  org_id: string;
  type: ActivityType;
  contact_id: string | null;
  deal_id: string | null;
  body: string | null;
  due_at: string | null;
  done_at: string | null;
  user_id: string | null;
  created_at: string;
};

export const CAMPAIGN_STATUSES = [
  "draft",
  "active",
  "paused",
  "archived",
  // Terminal: the campaign has been ended for good. Sending has stopped and its
  // in-flight enrollments are marked "stopped" so it can't silently resume.
  // Distinct from "archived", which is a reversible hide.
  "ended",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_AUDIENCE_MODES = [
  "segment",
  "contacts",
  "import",
] as const;
export type CampaignAudienceMode = (typeof CAMPAIGN_AUDIENCE_MODES)[number];

export const ENROLLMENT_STATUSES = [
  "active",
  "completed",
  "replied",
  "bounced",
  "unsubscribed",
  "stopped",
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export type Mailbox = {
  id: string;
  org_id: string;
  user_id: string | null;
  provider: string;
  email: string;
  display_name: string | null;
  daily_limit: number;
  status: "active" | "disabled";
  created_at: string;
  /** Connected-account fields (Gmail/Outlook OAuth). Null for address-only rows. */
  oauth_email: string | null;
  /** Last connect/refresh/send auth failure; null = healthy. Tokens are never exposed. */
  connect_error: string | null;
};

export type Campaign = {
  id: string;
  org_id: string;
  name: string;
  status: CampaignStatus;
  segment_id: string | null;
  mailbox_id: string | null;
  stop_on_reply: boolean;
  exclude_segment_id: string | null;
  scheduled_at: string | null;
  send_delay_minutes: number;
  audience_mode: CampaignAudienceMode;
  created_at: string;
  updated_at: string;
};

export type CampaignStep = {
  id: string;
  org_id: string;
  campaign_id: string;
  position: number;
  channel: string;
  subject: string | null;
  body: string | null;
  wait_minutes: number;
  /** null = inherit campaign.stop_on_reply; true/false = per-step override. */
  stop_on_reply: boolean | null;
  created_at: string;
};

export type CampaignEnrollment = {
  id: string;
  org_id: string;
  campaign_id: string;
  contact_id: string;
  status: EnrollmentStatus;
  current_step: number;
  enrolled_at: string;
  created_at: string;
};

export type ScrapeJob = {
  id: string;
  org_id: string;
  user_id: string | null;
  provider: string;
  /** Whether the search was for businesses or people. */
  kind: "companies" | "contacts";
  category: string;
  location: string;
  status: "pending" | "running" | "completed" | "failed";
  requested: number;
  imported: number;
  deduped: number;
  contacts: number;
  errored: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

export type ImportBatch = {
  id: string;
  org_id: string;
  target: "contacts" | "companies";
  source: string | null;
  filename: string | null;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errored: number;
  errors: { row: number; message: string }[] | null;
  created_by: string | null;
  created_at: string;
};

export type CrmSyncRun = {
  id: string;
  org_id: string;
  user_id: string | null;
  provider:
    | "hubspot"
    | "pipedrive"
    | "salesforce"
    | "zoho"
    | "jobber"
    | "housecall"
    | "servicetitan"
    | "quickbooks";
  trigger: "manual" | "scheduled";
  mode: "live" | "mock";
  status: "pending" | "running" | "completed" | "failed";
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  errored: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

// --- Inbox (conversations + two-way email threads) -------------------------

export const CONVERSATION_STATUSES = ["open", "closed"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const MESSAGE_DIRECTIONS = ["inbound", "outbound"] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export type Conversation = {
  id: string;
  org_id: string;
  contact_id: string;
  company_id: string | null;
  channel: "email";
  subject: string | null;
  status: ConversationStatus;
  assignee_id: string | null;
  last_message_at: string | null;
  last_message_snippet: string | null;
  last_message_direction: MessageDirection | null;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  org_id: string;
  conversation_id: string;
  contact_id: string | null;
  direction: MessageDirection;
  channel: "email";
  from_address: string | null;
  to_address: string | null;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  snippet: string | null;
  user_id: string | null;
  provider_message_id: string | null;
  campaign_id: string | null;
  created_at: string;
};

/**
 * A single entry in the unified inbox timeline. `message` entries render as
 * chat bubbles; `activity` and `event` entries render as system lines. The
 * timeline is built by merging all three sources and sorting by `at`.
 */
export type TimelineEntry =
  | { kind: "message"; at: string; message: Message }
  | { kind: "activity"; at: string; activity: Activity }
  | {
      kind: "event";
      at: string;
      event: {
        id: string;
        type: string;
        metadata: Record<string, unknown> | null;
      };
    };

export function contactName(c: {
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
}): string {
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return full || c.email || "Unnamed contact";
}

/** Compose the structured address parts into a single display string. */
export function formatAddress(c: {
  address?: string | null;
  address_line2?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country?: string | null;
}): string {
  const line1 = [c.address, c.address_line2].filter(Boolean).join(", ");
  const locality = [c.city, c.region, c.postal_code].filter(Boolean).join(" ");
  return [line1, locality, c.country].filter(Boolean).join(", ");
}
