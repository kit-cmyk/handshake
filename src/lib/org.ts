import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type Org = { id: string; name: string; role: string };

export const ACTIVE_ORG_COOKIE = "active_org";

type MembershipRow = {
  role: string;
  organizations: { id: string; name: string } | null;
};

async function loadOrgs(): Promise<Org[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("memberships")
    .select("role, organizations(id, name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return ((data ?? []) as unknown as MembershipRow[])
    .filter((m) => m.organizations)
    .map((m) => ({
      id: m.organizations!.id,
      name: m.organizations!.name,
      role: m.role,
    }));
}

/** All organizations the current user belongs to. */
export async function listOrgs(): Promise<Org[]> {
  return loadOrgs();
}

/**
 * The current user's active organization — the one named by the `active_org`
 * cookie if the user still belongs to it, otherwise their oldest membership.
 */
export async function getActiveOrg(): Promise<Org | null> {
  const orgs = await loadOrgs();
  if (orgs.length === 0) return null;

  const cookieStore = await cookies();
  const preferred = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  return orgs.find((o) => o.id === preferred) ?? orgs[0];
}
