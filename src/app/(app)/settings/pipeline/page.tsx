import { KanbanSquare } from "lucide-react";
import { requireContext } from "@/lib/context";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import type { Stage } from "@/lib/types";
import { PipelineForm } from "../pipeline-form";

type StageRow = Pick<Stage, "id" | "name" | "lifecycle_stage">;

export default async function PipelineSettingsPage() {
  const { supabase, org } = await requireContext();
  const canManage = org.role === "owner" || org.role === "admin";

  const { data: pipeline } = await supabase
    .from("pipelines")
    .select("id, name")
    .eq("org_id", org.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: stages } = pipeline
    ? await supabase
        .from("stages")
        .select("id, name, lifecycle_stage")
        .eq("pipeline_id", pipeline.id)
        .order("position", { ascending: true })
    : { data: [] as StageRow[] };

  const stageList = (stages ?? []) as StageRow[];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pipeline &amp; lifecycle</CardTitle>
        <CardDescription>
          Map each pipeline stage to a contact lifecycle stage. When a deal moves
          to a stage, its linked contact&apos;s lifecycle updates to match — so
          segments, campaigns, and workflows that key off lifecycle stay in sync.
          Leave a stage unmapped to have deal moves not touch the contact.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {stageList.length ? (
          <PipelineForm stages={stageList} canManage={canManage} />
        ) : (
          <EmptyState
            icon={KanbanSquare}
            title="No pipeline yet"
            description="This workspace has no pipeline stages to map."
          />
        )}
      </CardContent>
    </Card>
  );
}
