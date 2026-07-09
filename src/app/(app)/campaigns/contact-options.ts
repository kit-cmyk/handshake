import type { SupabaseClient } from "@supabase/supabase-js";
import type { LifecycleStage } from "@/lib/types";

export type ContactOption = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  stage: LifecycleStage;
};

/**
 * Load emailable contacts for the campaign wizard's "Select contacts" picker.
 * Only contacts with an email are returned — the sequence has nothing to send
 * to otherwise. Name falls back to the email when no first/last name is set.
 */
export async function loadCampaignContacts(
  supabase: SupabaseClient,
  orgId: string
): Promise<ContactOption[]> {
  const { data } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email, lifecycle_stage, companies(name)")
    .eq("org_id", orgId)
    .not("email", "is", null)
    .order("created_at", { ascending: false })
    .limit(2000);

  return ((data ?? []) as unknown as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    lifecycle_stage: LifecycleStage;
    companies: { name: string | null } | null;
  }[]).map((c) => ({
    id: c.id,
    name:
      [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email,
    email: c.email,
    company: c.companies?.name ?? null,
    stage: c.lifecycle_stage,
  }));
}
