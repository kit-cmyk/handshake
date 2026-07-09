import { Plus, KanbanSquare } from "lucide-react";
import { requireContext } from "@/lib/context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { DealBoard } from "./deal-board";
import { DealDialog } from "./deal-dialog";
import {
  contactName,
  type Contact,
  type Company,
  type DealWithRelations,
  type Pipeline,
  type Stage,
} from "@/lib/types";

export default async function DealsPage() {
  const { supabase, org } = await requireContext();

  const { data: pipeline } = await supabase
    .from("pipelines")
    .select("*")
    .eq("org_id", org.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!pipeline) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
        <EmptyState
          icon={KanbanSquare}
          title="No pipeline set up yet"
          description="This workspace doesn't have a deal pipeline. Once one's in place, your opportunities will show up here as a board."
        />
      </div>
    );
  }

  const pl = pipeline as Pipeline;

  const [{ data: stages }, { data: deals }, { data: companies }, { data: contacts }] =
    await Promise.all([
      supabase
        .from("stages")
        .select("*")
        .eq("pipeline_id", pl.id)
        .order("position", { ascending: true }),
      supabase
        .from("deals")
        .select(
          "*, companies(id, name), contacts(id, first_name, last_name, email)"
        )
        .eq("org_id", org.id)
        .order("created_at", { ascending: false }),
      supabase.from("companies").select("id, name").eq("org_id", org.id).order("name"),
      supabase
        .from("contacts")
        .select("id, first_name, last_name, email, company_id")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false }),
    ]);

  const stageList = (stages ?? []) as Stage[];
  const companyOptions = (companies ?? []) as Company[];
  const contactOptions = ((contacts ?? []) as Contact[]).map((c) => ({
    id: c.id,
    name: contactName(c),
    companyId: c.company_id,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            Move deals toward the close.
          </p>
        </div>
        <DealDialog
          pipelineId={pl.id}
          stages={stageList}
          companies={companyOptions.map((c) => ({ id: c.id, name: c.name }))}
          contacts={contactOptions}
          trigger={
            <Button>
              <Plus className="size-4" /> Add deal
            </Button>
          }
        />
      </div>

      <DealBoard
        pipelineId={pl.id}
        stages={stageList}
        deals={(deals ?? []) as DealWithRelations[]}
        companies={companyOptions.map((c) => ({ id: c.id, name: c.name }))}
        contacts={contactOptions}
      />
    </div>
  );
}
