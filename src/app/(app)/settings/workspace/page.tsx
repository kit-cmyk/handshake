import { requireContext } from "@/lib/context";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkspaceForm } from "../workspace-form";
import { SendWindowForm } from "../send-window-form";

export default async function WorkspaceSettingsPage() {
  const { supabase, org } = await requireContext();
  const canManage = org.role === "owner" || org.role === "admin";

  const [{ count: memberCount }, { data: sendCfg }] = await Promise.all([
    supabase
      .from("memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", org.id),
    supabase
      .from("organizations")
      .select(
        "send_timezone, send_window_start, send_window_end, send_days, booking_url"
      )
      .eq("id", org.id)
      .maybeSingle(),
  ]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace</CardTitle>
          <CardDescription>
            Your organization&apos;s name and the booking link used in emails.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkspaceForm
            name={org.name}
            bookingUrl={sendCfg?.booking_url ?? ""}
            canManage={canManage}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sending schedule</CardTitle>
          <CardDescription>
            The timezone and hours campaign &amp; workflow emails may send in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SendWindowForm
            timezone={sendCfg?.send_timezone ?? "UTC"}
            startHour={sendCfg?.send_window_start ?? 0}
            endHour={sendCfg?.send_window_end ?? 24}
            days={sendCfg?.send_days ?? [0, 1, 2, 3, 4, 5, 6]}
            canManage={canManage}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
          <CardDescription>Read-only workspace information.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Your role</dt>
              <dd className="mt-1">
                <Badge variant="secondary" className="capitalize">
                  {org.role}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Members</dt>
              <dd className="mt-1 text-sm font-medium">{memberCount ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Workspace ID</dt>
              <dd className="mt-1 font-mono text-xs text-muted-foreground">
                {org.id}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </>
  );
}
