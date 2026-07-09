import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg, type Org } from "@/lib/org";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AppContext = {
  supabase: SupabaseClient;
  org: Org;
  userId: string;
  userEmail: string | null;
};

/**
 * Resolves the authenticated user + active org for use in server components
 * and server actions. Redirects to /login or /onboarding when missing.
 */
export async function requireContext(): Promise<AppContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const org = await getActiveOrg();
  if (!org) redirect("/onboarding");

  return { supabase, org, userId: user.id, userEmail: user.email ?? null };
}
