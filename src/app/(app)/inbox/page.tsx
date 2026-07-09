import { requireContext } from "@/lib/context";
import { resolveAvatar } from "@/lib/avatar";
import { buildTimeline, TIMELINE_EVENT_TYPES } from "@/lib/inbox/timeline";
import {
  contactName,
  type Activity,
  type Conversation,
  type DealPriority,
  type LifecycleStage,
  type Message,
  type MessageDirection,
} from "@/lib/types";
import {
  ConversationList,
  type ConvRow,
  type PersonMap,
} from "./conversation-list";
import { ConversationPane } from "./conversation-pane";
import { ComposeEmail, type ComposeContact } from "./compose";
import { InboxFilters, type InboxTab, type InboxFilter } from "./inbox-filters";

type ConvJoin = Conversation & {
  contacts: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    lifecycle_stage: LifecycleStage;
  } | null;
  companies: { id: string; name: string } | null;
};

type DealPick = {
  stage: string | null;
  value: number | null;
  priority: DealPriority;
};

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    c?: string;
    filter?: string;
    q?: string;
  }>;
}) {
  const { supabase, org, userId } = await requireContext();
  const sp = await searchParams;
  const tab: InboxTab = sp.tab === "companies" ? "companies" : "contacts";
  const filter: InboxFilter = (
    ["all", "unread", "mine", "closed"].includes(sp.filter ?? "")
      ? sp.filter
      : "all"
  ) as InboxFilter;
  const q = (sp.q ?? "").trim().toLowerCase();

  const [
    { data: convData, error: convError },
    { data: reads },
    { data: profiles },
    { data: dealData },
    { data: contactData },
  ] = await Promise.all([
    supabase
      .from("conversations")
      .select(
        "*, contacts(id, first_name, last_name, email, lifecycle_stage), companies(id, name)"
      )
      .eq("org_id", org.id)
      .order("last_message_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("conversation_reads")
      .select("conversation_id, last_read_at")
      .eq("user_id", userId),
    supabase.from("profiles").select("id, full_name, email, avatar_url"),
    supabase
      .from("deals")
      .select("contact_id, value, priority, status, updated_at, stages(name)")
      .eq("org_id", org.id),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, email, companies(name)")
      .eq("org_id", org.id)
      .not("email", "is", null)
      .order("first_name", { ascending: true }),
  ]);

  // Pick each contact's primary deal: open first, then highest value, then most
  // recently updated. Surfaced as pipeline status · value · priority on the row.
  const deals = (dealData ?? []) as unknown as {
    contact_id: string | null;
    value: number | null;
    priority: DealPriority;
    status: string;
    updated_at: string;
    stages: { name: string | null } | null;
  }[];
  deals.sort((a, b) => {
    const ao = a.status === "open" ? 0 : 1;
    const bo = b.status === "open" ? 0 : 1;
    if (ao !== bo) return ao - bo;
    const av = a.value ?? -Infinity;
    const bv = b.value ?? -Infinity;
    if (av !== bv) return bv - av;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
  const dealByContact = new Map<string, DealPick>();
  for (const d of deals) {
    if (!d.contact_id || dealByContact.has(d.contact_id)) continue;
    dealByContact.set(d.contact_id, {
      stage: d.stages?.name ?? null,
      value: d.value,
      priority: d.priority,
    });
  }

  const composeContacts: ComposeContact[] = (
    (contactData ?? []) as unknown as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      companies: { name: string | null } | null;
    }[]
  ).map((c) => ({
    id: c.id,
    name: contactName(c),
    email: c.email ?? "",
    company: c.companies?.name ?? null,
  }));

  // Migration 0020 not applied yet — degrade to a clear, non-crashing message.
  const needsMigration = !!convError && /relation .* does not exist/i.test(
    convError.message
  );

  const readMap = new Map<string, string>(
    (reads ?? []).map((r) => [
      r.conversation_id as string,
      r.last_read_at as string,
    ])
  );

  const people: PersonMap = {};
  for (const p of profiles ?? []) {
    const row = p as {
      id: string;
      full_name: string | null;
      email: string | null;
      avatar_url: string | null;
    };
    people[row.id] = {
      name: (row.full_name || row.email || "Teammate").trim(),
      avatar: resolveAvatar(row.id, row.avatar_url),
    };
  }

  const allRows: ConvRow[] = ((convData ?? []) as ConvJoin[]).map((cv) => {
    const readAt = readMap.get(cv.id);
    const unread =
      cv.last_message_direction === "inbound" &&
      !!cv.last_message_at &&
      (!readAt || new Date(readAt).getTime() < new Date(cv.last_message_at).getTime());
    const deal = dealByContact.get(cv.contact_id);
    return {
      id: cv.id,
      contactId: cv.contact_id,
      contactName: cv.contacts ? contactName(cv.contacts) : "Unknown contact",
      contactEmail: cv.contacts?.email ?? null,
      companyId: cv.company_id,
      companyName: cv.companies?.name ?? null,
      status: cv.status,
      assigneeId: cv.assignee_id,
      lastMessageAt: cv.last_message_at,
      snippet: cv.last_message_snippet,
      direction: cv.last_message_direction as MessageDirection | null,
      unread,
      lifecycle: cv.contacts?.lifecycle_stage ?? "new",
      dealStage: deal?.stage ?? null,
      dealValue: deal?.value ?? null,
      dealPriority: deal?.priority ?? null,
    };
  });

  // Filters + search, applied in-memory (list sizes are modest per org).
  const rows = allRows.filter((r) => {
    if (filter === "unread" && !r.unread) return false;
    if (filter === "mine" && r.assigneeId !== userId) return false;
    if (filter === "closed" && r.status !== "closed") return false;
    if (filter !== "closed" && r.status === "closed") return false;
    if (q) {
      const hay = `${r.contactName} ${r.contactEmail ?? ""} ${r.companyName ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const selectedId =
    (sp.c && rows.some((r) => r.id === sp.c) ? sp.c : rows[0]?.id) ?? null;
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  // Load the selected conversation's unified timeline.
  let timeline: ReturnType<typeof buildTimeline> = [];
  if (selected) {
    const [{ data: messages }, { data: activities }, { data: events }] =
      await Promise.all([
        supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", selected.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("activities")
          .select("*")
          .eq("contact_id", selected.contactId)
          .order("created_at", { ascending: true }),
        supabase
          .from("events")
          .select("id, type, metadata, occurred_at")
          .eq("org_id", org.id)
          .eq("contact_id", selected.contactId)
          .in("type", [...TIMELINE_EVENT_TYPES])
          .order("occurred_at", { ascending: true }),
      ]);
    timeline = buildTimeline({
      messages: (messages ?? []) as Message[],
      activities: (activities ?? []) as Activity[],
      events: (events ?? []).map((e) => ({
        id: e.id as string,
        type: e.type as string,
        metadata: (e.metadata ?? null) as Record<string, unknown> | null,
        occurred_at: e.occurred_at as string,
      })),
    });
  }

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Every conversation, activity, and pipeline move — in one place.
        </p>
      </div>

      {needsMigration ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border bg-card">
          <div className="max-w-md text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Inbox needs its database tables.</p>
            <p className="mt-1">
              Apply migration{" "}
              <code className="rounded bg-muted px-1">0020_inbox.sql</code> to your
              Supabase project, then reload.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-[20rem_1fr] overflow-hidden rounded-lg border bg-card">
          <div className="flex min-h-0 flex-col border-r">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <span className="text-sm font-semibold">Conversations</span>
              <ComposeEmail contacts={composeContacts} />
            </div>
            <InboxFilters tab={tab} filter={filter} q={sp.q ?? ""} />
            <ConversationList
              rows={rows}
              tab={tab}
              selectedId={selectedId}
              people={people}
            />
          </div>
          <ConversationPane
            conversation={selected}
            timeline={timeline}
            people={people}
            currentUserId={userId}
          />
        </div>
      )}
    </div>
  );
}
