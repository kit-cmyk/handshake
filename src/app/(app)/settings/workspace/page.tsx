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

export default async function WorkspaceSettingsPage() {
  const { supabase, org } = await requireContext();
  const canManage = org.role === "owner" || org.role === "admin";

  const { count: memberCount } = await supabase
    .from("memberships")
    .select("user_id", { count: "exact", head: true })
    .eq("org_id", org.id);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace</CardTitle>
          <CardDescription>
            Your organization&apos;s name, shown across the app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkspaceForm name={org.name} canManage={canManage} />
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
