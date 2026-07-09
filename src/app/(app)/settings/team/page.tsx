import { requireContext } from "@/lib/context";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Team, type Member, type Invite } from "../team";

export default async function TeamSettingsPage() {
  const { supabase, org } = await requireContext();

  const [{ data: memberships }, { data: invites }] = await Promise.all([
    supabase
      .from("memberships")
      .select("role, user_id, profiles(full_name, email)")
      .eq("org_id", org.id),
    supabase
      .from("invitations")
      .select("id, email, role, token")
      .eq("org_id", org.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  const members: Member[] = (memberships ?? []).map((m) => {
    const row = m as unknown as {
      role: string;
      profiles:
        | { full_name: string | null; email: string | null }
        | { full_name: string | null; email: string | null }[]
        | null;
    };
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      name: p?.full_name ?? "",
      email: p?.email ?? "",
      role: row.role,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Team</CardTitle>
        <CardDescription>Members and pending invitations.</CardDescription>
      </CardHeader>
      <CardContent>
        <Team members={members} invites={(invites ?? []) as Invite[]} />
      </CardContent>
    </Card>
  );
}
