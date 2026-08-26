import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve the URL behind the {{booking_link}} merge token for one send.
 *
 * The sender's own calendar link (Settings ▸ Profile) wins; the workspace link
 * (Settings ▸ Workspace) is the fallback for members who never set one. Returns
 * "" when neither is configured, which renders the token empty.
 *
 * `userId` is the person the send goes out as — the signed-in user for a manual
 * reply, or the mailbox owner for campaign and workflow sends.
 */
export async function resolveBookingLink(
  supabase: SupabaseClient,
  { orgId, userId }: { orgId: string; userId?: string | null }
): Promise<string> {
  if (userId) {
    // select("*") keeps this working before the booking_url migration runs.
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    const personal = (profile as { booking_url?: string | null } | null)
      ?.booking_url;
    if (personal?.trim()) return personal.trim();
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("booking_url")
    .eq("id", orgId)
    .maybeSingle();
  return ((org?.booking_url as string | null) ?? "").trim();
}
