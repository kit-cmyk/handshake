"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";
import type { Company, Contact } from "@/lib/types";

export type FormState = { ok?: boolean; error?: string };

/** Everything the company side sheet renders, in one round-trip. */
export type CompanyProfile = {
  company: Company;
  contacts: Pick<
    Contact,
    "id" | "first_name" | "last_name" | "email" | "lifecycle_stage"
  >[];
  deals: {
    id: string;
    title: string;
    value: number | null;
    status: string;
    stage: string | null;
    pipeline: string | null;
  }[];
};

export async function getCompanyProfile(
  id: string
): Promise<CompanyProfile | null> {
  const { supabase } = await requireContext();

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single();
  if (!company) return null;

  const [{ data: contacts }, { data: deals }] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, first_name, last_name, email, lifecycle_stage")
      .eq("company_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("deals")
      .select("id, title, value, status, stages(name), pipelines(name)")
      .eq("company_id", id)
      .order("created_at", { ascending: false }),
  ]);

  // Supabase types nested relations as arrays; narrow to the single joined row.
  const one = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  return {
    company: company as Company,
    contacts: (contacts ?? []) as CompanyProfile["contacts"],
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

function num(fd: FormData, key: string): number | null {
  const s = str(fd, key);
  if (s === null) return null;
  const n = Number(s.replace(/[,$]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function saveCompany(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const { supabase, org } = await requireContext();
  const id = str(fd, "id");

  const name = str(fd, "name");
  if (!name) return { error: "Company name is required." };

  const payload = {
    org_id: org.id,
    name,
    category: str(fd, "category"),
    industry: str(fd, "industry"),
    website: str(fd, "website"),
    domain: str(fd, "domain"),
    phone: str(fd, "phone"),
    city: str(fd, "city"),
    region: str(fd, "region"),
    linkedin_url: str(fd, "linkedin_url"),
    employee_count: num(fd, "employee_count"),
    annual_revenue: num(fd, "annual_revenue"),
  };

  const { error } = id
    ? await supabase.from("companies").update(payload).eq("id", id)
    : await supabase.from("companies").insert(payload);

  if (error) return { error: error.message };

  revalidatePath("/companies");
  if (id) revalidatePath(`/companies/${id}`);
  return { ok: true };
}

export async function deleteCompany(id: string): Promise<FormState> {
  const { supabase } = await requireContext();
  // Remove deals linked only to this company first — deleting the company
  // SET-NULLs company_id, and a deal with no contact either would then violate
  // deals_contact_or_company_chk and abort the delete.
  await supabase.from("deals").delete().eq("company_id", id).is("contact_id", null);
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/companies");
  return { ok: true };
}

/**
 * Delete a batch of companies in a single query. Called once per chunk by the
 * bulk-task runner; the client refreshes the route once at the end, so this
 * skips per-call revalidation.
 */
export async function bulkDeleteCompanies(
  ids: string[]
): Promise<{ ok?: boolean; error?: string; deleted?: number }> {
  if (!ids.length) return { ok: true, deleted: 0 };
  const { supabase } = await requireContext();
  const { error, count } = await supabase
    .from("companies")
    .delete({ count: "exact" })
    .in("id", ids);
  if (error) return { error: error.message };
  return { ok: true, deleted: count ?? ids.length };
}
