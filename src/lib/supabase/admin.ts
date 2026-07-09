import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client that BYPASSES RLS. Server-only — never import into client
 * code. Used by background jobs (Inngest) that operate across organizations.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
