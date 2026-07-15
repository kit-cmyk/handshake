"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";
import { inngest } from "@/lib/inngest/client";
import {
  LIFECYCLE_STAGES,
  type Activity,
  type ContactWithCompany,
  type LifecycleStage,
} from "@/lib/types";

export type FormState = { ok?: boolean; error?: string };

/** Everything the contact side sheet renders, in one round-trip. */
export type ContactProfile = {
  contact: ContactWithCompany;
  activities: Activity[];
  campaigns: {
    id: string;
    status: string;
    current_step: number;
    enrolled_at: string;
    name: string;
  }[];
  workflows: {
    id: string;
    status: string;
    started_at: string;
    name: string;
  }[];
  segments: { id: string; name: string; type: string }[];
  deals: {
    id: string;
    title: string;
    value: number | null;
    status: string;
    stage: string | null;
    pipeline: string | null;
  }[];
};

export async function getContactProfile(
  id: string
): Promise<ContactProfile | null> {
  const { supabase } = await requireContext();

  const { data: contact } = await supabase
    .from("contacts")
    .select("*, companies(id, name)")
    .eq("id", id)
    .single();
  if (!contact) return null;

  const [
    { data: activities },
    { data: enrollments },
    { data: runs },
    { data: members },
    { data: deals },
  ] = await Promise.all([
    supabase
      .from("activities")
      .select("*")
      .eq("contact_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("campaign_enrollments")
      .select("id, status, current_step, enrolled_at, campaigns(name)")
      .eq("contact_id", id)
      .order("enrolled_at", { ascending: false }),
    supabase
      .from("workflow_runs")
      .select("id, status, started_at, workflows(name)")
      .eq("contact_id", id)
      .order("started_at", { ascending: false }),
    supabase
      .from("segment_members")
      .select("segment_id, segments(id, name, type)")
      .eq("contact_id", id),
    supabase
      .from("deals")
      .select("id, title, value, status, stages(name), pipelines(name)")
      .eq("contact_id", id)
      .order("created_at", { ascending: false }),
  ]);

  // Supabase types nested relations as arrays; narrow to the single joined row.
  const one = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  return {
    contact: contact as ContactWithCompany,
    activities: (activities ?? []) as Activity[],
    campaigns: (enrollments ?? []).map((e) => ({
      id: e.id as string,
      status: e.status as string,
      current_step: e.current_step as number,
      enrolled_at: e.enrolled_at as string,
      name: one<{ name: string }>(e.campaigns)?.name ?? "Untitled campaign",
    })),
    workflows: (runs ?? []).map((r) => ({
      id: r.id as string,
      status: r.status as string,
      started_at: r.started_at as string,
      name: one<{ name: string }>(r.workflows)?.name ?? "Untitled workflow",
    })),
    segments: (members ?? [])
      .map((m) => one<{ id: string; name: string; type: string }>(m.segments))
      .filter((s): s is { id: string; name: string; type: string } => !!s),
    deals: (deals ?? []).map((d) => ({
      id: d.id as string,
      title: d.title as string,
      value: (d.value as number | null) ?? null,
      status: d.status as string,
      stage: one<{ name: string }>(d.stages)?.name ?? null,
      pipeline: one<{ name: string }>(d.pipelines)?.name ?? null,
    })),
  };
}

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

export async function saveContact(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const { supabase, org } = await requireContext();
  const id = str(fd, "id");

  const stageRaw = str(fd, "lifecycle_stage") ?? "new";
  const lifecycle_stage = (
    LIFECYCLE_STAGES.includes(stageRaw as LifecycleStage) ? stageRaw : "new"
  ) as LifecycleStage;

  const payload = {
    org_id: org.id,
    first_name: str(fd, "first_name"),
    last_name: str(fd, "last_name"),
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    title: str(fd, "title"),
    company_id: str(fd, "company_id"),
    lifecycle_stage,
    lead_source: str(fd, "lead_source"),
    address: str(fd, "address"),
    address_line2: str(fd, "address_line2"),
    city: str(fd, "city"),
    region: str(fd, "region"),
    postal_code: str(fd, "postal_code"),
    country: str(fd, "country"),
    // Only editable when updating an existing contact (see contact-dialog).
    ...(id ? { appointment_date: str(fd, "appointment_date") } : {}),
  };

  if (!payload.first_name && !payload.last_name && !payload.email) {
    return { error: "Enter at least a name or an email." };
  }

  // A linked company must belong to this org. RLS hides foreign rows on read but
  // an INSERT's WITH CHECK only validates the contact's own org_id, so a forged
  // foreign company_id would otherwise be written.
  if (payload.company_id) {
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("id", payload.company_id)
      .maybeSingle();
    if (!company) return { error: "Invalid company." };
  }

  // Capture the prior stage so we can fire a stage-change event on transitions.
  let prevStage: string | null = null;
  if (id) {
    const { data: prev } = await supabase
      .from("contacts")
      .select("lifecycle_stage")
      .eq("id", id)
      .single();
    prevStage = (prev?.lifecycle_stage as string | undefined) ?? null;
  }

  const { error } = id
    ? await supabase.from("contacts").update(payload).eq("id", id)
    : await supabase.from("contacts").insert(payload);

  if (error) return { error: error.message };

  if (id && prevStage && prevStage !== lifecycle_stage) {
    await inngest.send({
      name: "contact/stage.changed",
      data: { orgId: org.id, contactId: id, from: prevStage, to: lifecycle_stage },
    });
  }

  revalidatePath("/contacts");
  if (id) revalidatePath(`/contacts/${id}`);
  return { ok: true };
}

export async function deleteContact(id: string): Promise<FormState> {
  const { supabase } = await requireContext();
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/contacts");
  return { ok: true };
}

/**
 * Delete a batch of contacts in a single query. The bulk-task runner calls this
 * once per chunk; the client refreshes the route once when the whole run ends,
 * so this intentionally skips per-call revalidation.
 */
export async function bulkDeleteContacts(
  ids: string[]
): Promise<{ ok?: boolean; error?: string; deleted?: number }> {
  if (!ids.length) return { ok: true, deleted: 0 };
  const { supabase } = await requireContext();
  const { error, count } = await supabase
    .from("contacts")
    .delete({ count: "exact" })
    .in("id", ids);
  if (error) return { error: error.message };
  return { ok: true, deleted: count ?? ids.length };
}

export async function updateLifecycle(
  id: string,
  stage: LifecycleStage
): Promise<FormState> {
  const { supabase, org } = await requireContext();
  // Server actions are public endpoints — the TS type isn't enforced at runtime,
  // so allowlist the stage explicitly rather than trusting the argument.
  if (!LIFECYCLE_STAGES.includes(stage)) return { error: "Invalid lifecycle stage." };
  const { data: prev } = await supabase
    .from("contacts")
    .select("lifecycle_stage")
    .eq("id", id)
    .single();
  const prevStage = (prev?.lifecycle_stage as string | undefined) ?? null;

  const { error } = await supabase
    .from("contacts")
    .update({ lifecycle_stage: stage })
    .eq("id", id);
  if (error) return { error: error.message };

  if (prevStage && prevStage !== stage) {
    await inngest.send({
      name: "contact/stage.changed",
      data: { orgId: org.id, contactId: id, from: prevStage, to: stage },
    });
  }

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
  return { ok: true };
}
