"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";
import { notifyDealWon } from "@/lib/integrations/notify";
import { syncContactLifecycleFromDeal } from "@/lib/lifecycle";
import {
  DEAL_PRIORITIES,
  contactName,
  type Activity,
  type ActivityType,
  type Company,
  type Contact,
  type DealPriority,
  type DealStatus,
  type DealWithRelations,
  type LifecycleStage,
  type Stage,
} from "@/lib/types";

export type FormState = { ok?: boolean; error?: string };

export type DealContactOption = {
  id: string;
  name: string;
  companyId: string | null;
};

export type DealTimelineKind = "activity" | "campaign" | "workflow" | "stage";

export type DealTimelineItem = {
  id: string;
  at: string;
  kind: DealTimelineKind;
  /** Present for activity items, to pick an icon. */
  activityType: ActivityType | null;
  title: string;
  subtitle: string | null;
};

export type DealProfile = {
  deal: DealWithRelations & {
    stages: { name: string } | null;
    pipelines: { name: string } | null;
  };
  timeline: DealTimelineItem[];
  stages: Stage[];
  companies: { id: string; name: string }[];
  contacts: DealContactOption[];
};

function joinedName(v: unknown): string | null {
  if (Array.isArray(v)) return (v[0] as { name?: string } | undefined)?.name ?? null;
  return (v as { name?: string } | null)?.name ?? null;
}

/** Everything the deal side sheet renders, in one round-trip. */
export async function getDealProfile(id: string): Promise<DealProfile | null> {
  const { supabase, org } = await requireContext();

  const { data: deal } = await supabase
    .from("deals")
    .select(
      "*, companies(id, name), contacts(id, first_name, last_name, email), stages(name), pipelines(name)"
    )
    .eq("id", id)
    .single();
  if (!deal) return null;

  const d = deal as DealProfile["deal"];
  const contactId = d.contact_id;

  // Resolve the company this deal belongs to (directly, or via its contact) so
  // the thread can include company-wide activity, not just this deal's.
  let companyId = d.company_id;
  if (!companyId && contactId) {
    const { data: c } = await supabase
      .from("contacts")
      .select("company_id")
      .eq("id", contactId)
      .single();
    companyId = (c?.company_id as string | null) ?? null;
  }

  // Build the activity scope: this deal + its contact, plus every contact and
  // deal belonging to the same company.
  const contactIds = new Set<string>();
  if (contactId) contactIds.add(contactId);
  const dealIds = new Set<string>([id]);
  if (companyId) {
    const [{ data: coContacts }, { data: coDeals }] = await Promise.all([
      supabase.from("contacts").select("id").eq("org_id", org.id).eq("company_id", companyId),
      supabase.from("deals").select("id").eq("org_id", org.id).eq("company_id", companyId),
    ]);
    for (const c of coContacts ?? []) contactIds.add(c.id as string);
    for (const dd of coDeals ?? []) dealIds.add(dd.id as string);
  }

  const orParts = [`deal_id.in.(${[...dealIds].join(",")})`];
  if (contactIds.size) orParts.push(`contact_id.in.(${[...contactIds].join(",")})`);
  const contactIdArr = [...contactIds];

  const [
    { data: activities },
    { data: stages },
    { data: companies },
    { data: contacts },
    { data: enrollments },
    { data: runs },
    { data: stageEvents },
  ] = await Promise.all([
    supabase
      .from("activities")
      .select("*")
      .eq("org_id", org.id)
      .or(orParts.join(","))
      .order("created_at", { ascending: false }),
    supabase
      .from("stages")
      .select("*")
      .eq("pipeline_id", d.pipeline_id)
      .order("position", { ascending: true }),
    supabase.from("companies").select("id, name").eq("org_id", org.id).order("name"),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, email, company_id")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false }),
    // Campaigns the contact(s) are enrolled in.
    contactIdArr.length
      ? supabase
          .from("campaign_enrollments")
          .select("id, status, enrolled_at, campaigns(name)")
          .eq("org_id", org.id)
          .in("contact_id", contactIdArr)
      : Promise.resolve({ data: [] as unknown[] }),
    // Workflow runs for the contact(s).
    contactIdArr.length
      ? supabase
          .from("workflow_runs")
          .select("id, status, started_at, workflows(name)")
          .eq("org_id", org.id)
          .in("contact_id", contactIdArr)
      : Promise.resolve({ data: [] as unknown[] }),
    // Pipeline movement for this deal (logged into the append-only event log).
    supabase
      .from("events")
      .select("id, occurred_at, metadata")
      .eq("org_id", org.id)
      .eq("type", "stage_moved")
      .eq("metadata->>deal_id", id)
      .order("occurred_at", { ascending: false }),
  ]);

  const timeline: DealTimelineItem[] = [];

  for (const a of (activities ?? []) as Activity[]) {
    timeline.push({
      id: `a-${a.id}`,
      at: a.created_at,
      kind: "activity",
      activityType: a.type,
      title: a.body ?? "—",
      subtitle: a.type,
    });
  }
  for (const e of (enrollments ?? []) as Record<string, unknown>[]) {
    timeline.push({
      id: `c-${e.id as string}`,
      at: e.enrolled_at as string,
      kind: "campaign",
      activityType: null,
      title: `Enrolled in ${joinedName(e.campaigns) ?? "a campaign"}`,
      subtitle: `Campaign · ${e.status as string}`,
    });
  }
  for (const r of (runs ?? []) as Record<string, unknown>[]) {
    timeline.push({
      id: `w-${r.id as string}`,
      at: r.started_at as string,
      kind: "workflow",
      activityType: null,
      title: `Entered ${joinedName(r.workflows) ?? "a workflow"}`,
      subtitle: `Workflow · ${r.status as string}`,
    });
  }
  for (const s of (stageEvents ?? []) as Record<string, unknown>[]) {
    const meta = (s.metadata ?? {}) as { from?: string | null; to?: string | null };
    timeline.push({
      id: `s-${s.id as string}`,
      at: s.occurred_at as string,
      kind: "stage",
      activityType: null,
      title: meta.from
        ? `Moved ${meta.from} → ${meta.to ?? "—"}`
        : `Moved to ${meta.to ?? "—"}`,
      subtitle: "Pipeline",
    });
  }

  timeline.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));

  return {
    deal: d,
    timeline,
    stages: (stages ?? []) as Stage[],
    companies: ((companies ?? []) as Company[]).map((c) => ({
      id: c.id,
      name: c.name,
    })),
    contacts: ((contacts ?? []) as Contact[]).map((c) => ({
      id: c.id,
      name: contactName(c),
      companyId: c.company_id,
    })),
  };
}

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

/** Derive deal status from the stage name it lands in. */
function statusForStage(stageName: string | null | undefined): DealStatus {
  const n = (stageName ?? "").toLowerCase();
  if (n === "won") return "won";
  if (n === "lost") return "lost";
  return "open";
}

export async function saveDeal(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const { supabase, org } = await requireContext();
  const id = str(fd, "id");

  const title = str(fd, "title");
  const pipeline_id = str(fd, "pipeline_id");
  const stage_id = str(fd, "stage_id");
  if (!title) return { error: "Deal title is required." };
  if (!pipeline_id || !stage_id) return { error: "Pipeline and stage are required." };

  const company_id = str(fd, "company_id");
  const contact_id = str(fd, "contact_id");
  if (!company_id && !contact_id) {
    return { error: "Link the deal to a company or a contact." };
  }

  // Verify every linked record belongs to this org. RLS hides foreign rows from
  // reads, but an INSERT's WITH CHECK only validates the deal's own org_id — so a
  // forged foreign pipeline/stage/company/contact id would otherwise be written.
  const owns = async (table: string, fkId: string | null): Promise<boolean> => {
    if (!fkId) return true;
    const { data } = await supabase.from(table).select("id").eq("id", fkId).maybeSingle();
    return !!data;
  };
  if (!(await owns("pipelines", pipeline_id))) return { error: "Invalid pipeline." };
  if (!(await owns("stages", stage_id))) return { error: "Invalid stage." };
  if (!(await owns("companies", company_id))) return { error: "Invalid company." };
  if (!(await owns("contacts", contact_id))) return { error: "Invalid contact." };

  const valueRaw = str(fd, "value");
  const value = valueRaw ? Number(valueRaw.replace(/[,$]/g, "")) : null;

  const priorityRaw = str(fd, "priority") ?? "medium";
  const priority = (
    DEAL_PRIORITIES.includes(priorityRaw as DealPriority) ? priorityRaw : "medium"
  ) as DealPriority;

  const { data: stage } = await supabase
    .from("stages")
    .select("name, lifecycle_stage")
    .eq("id", stage_id)
    .single();

  // Capture the prior status/stage so we announce won transitions and log
  // stage moves made through the edit form (not just board drags).
  const prior = id
    ? (
        await supabase
          .from("deals")
          .select("status, stage_id, contact_id, stages(name)")
          .eq("id", id)
          .maybeSingle()
      ).data
    : null;
  const priorStatus = prior?.status ?? null;

  const payload = {
    org_id: org.id,
    title,
    pipeline_id,
    stage_id,
    company_id,
    contact_id,
    value: value !== null && Number.isFinite(value) ? value : null,
    service: str(fd, "service"),
    description: str(fd, "description"),
    priority,
    close_date: str(fd, "close_date"),
    status: statusForStage(stage?.name),
  };

  const { error } = id
    ? await supabase.from("deals").update(payload).eq("id", id)
    : await supabase.from("deals").insert(payload);

  if (error) return { error: error.message };

  if (payload.status === "won" && priorStatus !== "won") {
    await notifyDealWon(supabase, org.id, title, payload.value);
  }

  // Log stage moves made through the edit form so they show on the timeline.
  const priorStages = (
    prior as { stages?: { name: string | null } | { name: string | null }[] } | null
  )?.stages;
  const priorStageName = Array.isArray(priorStages)
    ? (priorStages[0]?.name ?? null)
    : (priorStages?.name ?? null);
  const priorStageId = (prior as { stage_id?: string } | null)?.stage_id;
  if (id && priorStageId && priorStageId !== stage_id) {
    await supabase.from("events").insert({
      org_id: org.id,
      type: "stage_moved",
      contact_id,
      metadata: {
        deal_id: id,
        deal_title: title,
        from: priorStageName,
        to: stage?.name ?? null,
      },
    });
  }

  // Keep the linked contact's lifecycle in step with the deal's stage. Run on
  // create (a deal opened at a mid-funnel stage) and whenever the stage moves;
  // skip plain edits that leave the stage where it was.
  if (contact_id && (!id || priorStageId !== stage_id)) {
    await syncContactLifecycleFromDeal(
      supabase,
      org.id,
      contact_id,
      (stage as { name: string | null; lifecycle_stage: LifecycleStage | null } | null) ?? null,
      payload.status,
    );
    revalidatePath("/contacts");
  }

  revalidatePath("/pipeline");
  if (id) revalidatePath(`/pipeline/${id}`);
  return { ok: true };
}

/** Quick-log a note against a deal (and its linked contact) from the side sheet. */
export async function addDealNote(
  dealId: string,
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const { supabase, org, userId } = await requireContext();
  const body = String(fd.get("body") ?? "").trim();
  if (!body) return { error: "Write a note first." };

  const { data: deal } = await supabase
    .from("deals")
    .select("contact_id")
    .eq("id", dealId)
    .single();

  const { error } = await supabase.from("activities").insert({
    org_id: org.id,
    deal_id: dealId,
    contact_id: (deal?.contact_id as string | null) ?? null,
    user_id: userId,
    type: "note",
    body,
  });
  if (error) return { error: error.message };

  revalidatePath(`/pipeline/${dealId}`);
  revalidatePath("/pipeline");
  return { ok: true };
}

export async function moveDeal(dealId: string, stageId: string) {
  const { supabase, org } = await requireContext();
  const { data: stage } = await supabase
    .from("stages")
    .select("name, lifecycle_stage")
    .eq("id", stageId)
    .single();

  const { data: prior } = await supabase
    .from("deals")
    .select("status, title, value, stage_id, contact_id, stages(name)")
    .eq("id", dealId)
    .maybeSingle();

  const newStatus = statusForStage(stage?.name);

  await supabase
    .from("deals")
    .update({ stage_id: stageId, status: newStatus })
    .eq("id", dealId);

  // Record the pipeline move so it surfaces in the inbox timeline (and enriches
  // funnel reporting). Best-effort: a logging failure must not block the move.
  const priorRow = prior as
    | {
        status: DealStatus;
        title: string | null;
        value: number | null;
        stage_id: string | null;
        contact_id: string | null;
        stages: { name: string | null } | null;
      }
    | null;
  if (priorRow && priorRow.stage_id !== stageId) {
    await supabase.from("events").insert({
      org_id: org.id,
      type: "stage_moved",
      contact_id: priorRow.contact_id,
      metadata: {
        deal_id: dealId,
        deal_title: priorRow.title,
        from: priorRow.stages?.name ?? null,
        to: stage?.name ?? null,
      },
    });
  }

  if (newStatus === "won" && priorRow?.status !== "won") {
    await notifyDealWon(
      supabase,
      org.id,
      priorRow?.title ?? "Deal",
      priorRow?.value ?? null,
    );
  }

  // Move the contact's lifecycle to match the deal's new pipeline position —
  // only when the stage actually changed, so re-dropping a deal on its current
  // stage doesn't churn the contact or emit a spurious stage-change event.
  if (priorRow && priorRow.stage_id !== stageId) {
    await syncContactLifecycleFromDeal(
      supabase,
      org.id,
      priorRow.contact_id,
      (stage as { name: string | null; lifecycle_stage: LifecycleStage | null } | null) ?? null,
      newStatus,
    );
  }

  revalidatePath("/pipeline");
  revalidatePath("/contacts");
}

export async function deleteDeal(id: string): Promise<FormState> {
  const { supabase } = await requireContext();
  const { error } = await supabase.from("deals").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/pipeline");
  return { ok: true };
}
