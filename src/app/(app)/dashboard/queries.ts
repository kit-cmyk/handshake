import { requireContext } from "@/lib/context";
import { contactName } from "@/lib/types";
import {
  monthKeyBefore,
  monthStartIso,
  type RevenueRow,
  type StatusTotalRow,
} from "./metrics";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Every Supabase read the dashboard makes, in one file.
 *
 * Two rules hold everywhere here, and keeping the reads together is what makes
 * them checkable at a glance:
 *
 *  1. **Every query is scoped with `.eq("org_id", org.id)` — including the
 *     views.** The views are `security_invoker`, so RLS applies, but RLS admits
 *     every org the user belongs to, not the active one. A view is not a
 *     substitute for the filter.
 *
 *  2. **Nothing here pages.** Every result is bounded by construction: a
 *     `head: true` count returns no rows at all, the aggregate views return one
 *     row per group, and the lists carry an explicit `.limit()`. `fetchAllRows`
 *     is deliberately absent — please don't "fix" a bounded query into a
 *     whole-table read.
 *
 * Sums in particular must come from the views: PostgREST caps a SELECT at 1000
 * rows and reports no error, so adding up `deals.value` in JS goes quietly
 * wrong the moment a workspace passes a thousand deals.
 */

/** Migrations are applied out of band, so a missing view degrades, not crashes. */
function isMissingRelation(error: { message?: string } | null): boolean {
  return !!error?.message && /relation .* does not exist/i.test(error.message);
}

export type HeadlineData = {
  statusTotals: StatusTotalRow[];
  revenue: RevenueRow[];
  newContacts: number;
  /** False when migration 0043 hasn't been applied — the money sections hide. */
  hasMetrics: boolean;
};

export async function loadHeadline(now: Date): Promise<HeadlineData> {
  const { supabase, org } = await requireContext();

  const [totals, revenue, contacts] = await Promise.all([
    supabase
      .from("deal_value_totals")
      .select("status, deals, value, missing_value")
      .eq("org_id", org.id),
    // Twelve months fetched once: it draws the trend *and* feeds the
    // month-over-month delta and the win rate, so those cost no extra queries.
    supabase
      .from("deal_revenue_by_month")
      .select("month, status, deals, value")
      .eq("org_id", org.id)
      .gte("month", monthKeyBefore(now, 11))
      .order("month"),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .gte("created_at", monthStartIso(now)),
  ]);

  const hasMetrics = !isMissingRelation(totals.error);

  return {
    statusTotals: (totals.data ?? []) as StatusTotalRow[],
    revenue: (revenue.data ?? []) as RevenueRow[],
    newContacts: contacts.count ?? 0,
    hasMetrics,
  };
}

export type TaskRow = {
  id: string;
  type: string;
  body: string | null;
  dueAt: string;
  contactId: string | null;
  contactName: string | null;
  dealId: string | null;
  dealTitle: string | null;
};

export type ReplyRow = {
  id: string;
  contactName: string;
  subject: string | null;
  snippet: string | null;
  at: string | null;
};

export type StalledDealRow = {
  id: string;
  title: string;
  value: number | null;
  company: string | null;
  updatedAt: string;
};

export type ActionQueueData = {
  tasks: TaskRow[];
  overdueCount: number;
  replies: ReplyRow[];
  /** True when unread replies were capped by the scan window — render as "N+". */
  repliesTruncated: boolean;
  stalled: StalledDealRow[];
};

/** Deals untouched for this long are treated as stalled. */
const STALE_DAYS = 14;

/** How many recent inbound conversations we scan for unread ones. */
const REPLY_SCAN = 50;

export async function loadActionQueue(now: Date): Promise<ActionQueueData> {
  const { supabase, org, userId } = await requireContext();

  const nowIso = now.toISOString();
  const staleBefore = new Date(
    now.getTime() - STALE_DAYS * 86_400_000
  ).toISOString();
  // Everything dated up to the end of today counts as "on your plate now".
  const endOfToday = new Date(now);
  endOfToday.setUTCHours(23, 59, 59, 999);

  const [tasks, overdue, conversations, stalled] = await Promise.all([
    supabase
      .from("activities")
      .select(
        "id, type, body, due_at, contact_id, deal_id, contacts(first_name, last_name, email), deals(title)"
      )
      .eq("org_id", org.id)
      .in("type", ["task", "appointment"])
      .is("done_at", null)
      .not("due_at", "is", null)
      .lte("due_at", endOfToday.toISOString())
      .order("due_at", { ascending: true })
      .limit(8),
    supabase
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .in("type", ["task", "appointment"])
      .is("done_at", null)
      .lt("due_at", nowIso),
    supabase
      .from("conversations")
      .select(
        "id, subject, last_message_at, last_message_snippet, contacts(first_name, last_name, email)"
      )
      .eq("org_id", org.id)
      .eq("status", "open")
      .eq("last_message_direction", "inbound")
      .order("last_message_at", { ascending: false })
      .limit(REPLY_SCAN),
    supabase
      .from("deals")
      .select("id, title, value, updated_at, companies(name)")
      .eq("org_id", org.id)
      .eq("status", "open")
      .lt("updated_at", staleBefore)
      .order("value", { ascending: false, nullsFirst: false })
      .limit(5),
  ]);

  const convRows = (conversations.data ?? []) as ConversationJoin[];
  const replies = await unreadReplies(supabase, org.id, userId, convRows);

  return {
    tasks: (tasks.data ?? []).map(toTaskRow),
    overdueCount: overdue.count ?? 0,
    replies: replies.slice(0, 5),
    repliesTruncated: convRows.length === REPLY_SCAN,
    stalled: (stalled.data ?? []).map((d) => ({
      id: d.id as string,
      title: d.title as string,
      value: (d.value as number | null) ?? null,
      company: one<{ name: string | null }>(d.companies)?.name ?? null,
      updatedAt: d.updated_at as string,
    })),
  };
}

type ConversationJoin = {
  id: string;
  subject: string | null;
  last_message_at: string | null;
  last_message_snippet: string | null;
  contacts: ContactNameFields | ContactNameFields[] | null;
};

type ContactNameFields = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

/**
 * Conversations whose newest inbound message landed after this user last read
 * the thread. Same rule the inbox itself applies, per user rather than per org —
 * "unread" is personal, and a teammate reading a thread doesn't clear it here.
 */
async function unreadReplies(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  rows: ConversationJoin[]
): Promise<ReplyRow[]> {
  if (!rows.length) return [];

  const { data: reads } = await supabase
    .from("conversation_reads")
    .select("conversation_id, last_read_at")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .in(
      "conversation_id",
      rows.map((r) => r.id)
    );

  const readAt = new Map<string, string>(
    (reads ?? []).map((r) => [
      r.conversation_id as string,
      r.last_read_at as string,
    ])
  );

  return rows
    .filter((c) => {
      if (!c.last_message_at) return false;
      const seen = readAt.get(c.id);
      return (
        !seen ||
        new Date(seen).getTime() < new Date(c.last_message_at).getTime()
      );
    })
    .map((c) => {
      const contact = one<ContactNameFields>(c.contacts);
      return {
        id: c.id,
        contactName: contact ? contactName(contact) : "Unknown contact",
        subject: c.subject,
        snippet: c.last_message_snippet,
        at: c.last_message_at,
      };
    });
}

/** Supabase types nested relations as arrays; narrow to the single joined row. */
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function toTaskRow(a: Record<string, unknown>): TaskRow {
  const contact = one<ContactNameFields>(
    a.contacts as ContactNameFields | ContactNameFields[] | null
  );
  const deal = one<{ title: string }>(
    a.deals as { title: string } | { title: string }[] | null
  );
  return {
    id: a.id as string,
    type: a.type as string,
    body: (a.body as string | null) ?? null,
    dueAt: a.due_at as string,
    contactId: (a.contact_id as string | null) ?? null,
    contactName: contact ? contactName(contact) : null,
    dealId: (a.deal_id as string | null) ?? null,
    dealTitle: deal?.title ?? null,
  };
}

export type StageRow = {
  stageId: string;
  stage: string;
  position: number;
  deals: number;
  value: number;
};

export type LifecycleRow = { stage: string; contacts: number };

export type CampaignRow = {
  id: string;
  name: string;
  sent: number;
  replied: number;
};

export type BreakdownData = {
  stages: StageRow[];
  lifecycle: LifecycleRow[];
  campaigns: CampaignRow[];
};

export async function loadBreakdowns(): Promise<BreakdownData> {
  const { supabase, org } = await requireContext();

  const [stages, lifecycle, campaigns] = await Promise.all([
    supabase
      .from("deal_stage_totals")
      .select("stage_id, stage, position, deals, value")
      .eq("org_id", org.id)
      .order("position"),
    supabase
      .from("contact_lifecycle_counts")
      .select("lifecycle_stage, contacts")
      .eq("org_id", org.id),
    supabase
      .from("campaigns")
      .select("id, name")
      .eq("org_id", org.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const campaignRows = (campaigns.data ?? []) as { id: string; name: string }[];
  let funnel: CampaignRow[] = [];

  if (campaignRows.length) {
    // Reuses the aggregate view migration 0042 already built for the reports
    // pages, so the dashboard never touches the raw `events` table.
    const { data: totals } = await supabase
      .from("campaign_funnel_totals")
      .select("campaign_id, type, contacts")
      .eq("org_id", org.id)
      .in(
        "campaign_id",
        campaignRows.map((c) => c.id)
      );

    const byCampaign = new Map<string, Map<string, number>>();
    for (const row of (totals ?? []) as {
      campaign_id: string;
      type: string;
      contacts: number;
    }[]) {
      const m = byCampaign.get(row.campaign_id) ?? new Map<string, number>();
      m.set(row.type, row.contacts);
      byCampaign.set(row.campaign_id, m);
    }

    funnel = campaignRows.map((c) => {
      const m = byCampaign.get(c.id);
      return {
        id: c.id,
        name: c.name,
        sent: m?.get("sent") ?? 0,
        replied: m?.get("replied") ?? 0,
      };
    });
  }

  return {
    stages: (stages.data ?? []).map((s) => ({
      stageId: s.stage_id as string,
      stage: s.stage as string,
      position: s.position as number,
      deals: s.deals as number,
      value: Number(s.value ?? 0),
    })),
    lifecycle: (lifecycle.data ?? []).map((l) => ({
      stage: l.lifecycle_stage as string,
      contacts: l.contacts as number,
    })),
    campaigns: funnel,
  };
}

/**
 * Whether the workspace has anything at all. Runs before the rest so a brand-new
 * org costs two counts instead of a dozen queries against empty tables.
 */
export async function loadWorkspaceState(): Promise<{ empty: boolean }> {
  const { supabase, org } = await requireContext();

  const [contacts, deals] = await Promise.all([
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id),
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id),
  ]);

  return { empty: (contacts.count ?? 0) === 0 && (deals.count ?? 0) === 0 };
}

export type DataHealth = {
  missingEmail: number;
  missingName: number;
  total: number;
};

/**
 * A cheap read on contact quality.
 *
 * Deliberately *not* `detectIssues()` from `@/lib/data-quality`: that one needs
 * every contact row in memory to find duplicates, which is a fine trade on the
 * import and lead-search screens where a scan has just happened, and a bad one
 * on a page that loads on every login.
 *
 * So this counts only what an index can answer — contacts with no email and
 * contacts with no name — and links out to the issues page for the full scan.
 * It understates: duplicates are not counted here. That is the point.
 */
export async function loadDataHealth(): Promise<DataHealth> {
  const { supabase, org } = await requireContext();

  const [noEmail, noName] = await Promise.all([
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .is("email", null),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .is("first_name", null)
      .is("last_name", null),
  ]);

  const missingEmail = noEmail.count ?? 0;
  const missingName = noName.count ?? 0;
  return { missingEmail, missingName, total: missingEmail + missingName };
}
