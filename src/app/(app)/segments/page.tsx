import { Plus, ListFilter, Upload } from "lucide-react";
import { requireContext } from "@/lib/context";
import { Button } from "@/components/ui/button";
import { SegmentSheet } from "./segment-sheet";
import { SegmentImportSheet } from "./segment-import-sheet";
import { EmptyState } from "@/components/empty-state";
import { SegmentsTable, type SegmentRow } from "./segments-table";
import {
  evaluateFilter,
  parseDefinition,
  EVALUABLE_SELECT,
  type EvaluableContact,
  type Segment,
} from "@/lib/segments";

export default async function SegmentsPage() {
  const { supabase, org } = await requireContext();

  const [{ data: segments }, { data: members }, { data: contacts }] =
    await Promise.all([
      supabase
        .from("segments")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false }),
      supabase.from("segment_members").select("segment_id").eq("org_id", org.id),
      supabase.from("contacts").select(EVALUABLE_SELECT).eq("org_id", org.id),
    ]);

  const segs = (segments ?? []) as Segment[];
  const evaluable = (contacts ?? []) as unknown as EvaluableContact[];

  // Static counts from cached membership; dynamic counts computed live.
  const staticCounts = new Map<string, number>();
  for (const m of members ?? []) {
    const sid = (m as { segment_id: string }).segment_id;
    staticCounts.set(sid, (staticCounts.get(sid) ?? 0) + 1);
  }
  function count(s: Segment): number {
    return s.type === "dynamic"
      ? evaluateFilter(evaluable, parseDefinition(s.definition)).length
      : staticCounts.get(s.id) ?? 0;
  }

  const rows: SegmentRow[] = segs.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    members: count(s),
    updated_at: s.updated_at,
    segment: s,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Segments</h1>
          <p className="text-sm text-muted-foreground">
            Static lists and dynamic, auto-updating audiences.
          </p>
        </div>
        <div className="flex gap-2">
          <SegmentImportSheet
            trigger={
              <Button variant="outline">
                <Upload className="size-4" /> Import CSV
              </Button>
            }
          />
          <SegmentSheet
            trigger={
              <Button>
                <Plus className="size-4" /> New segment
              </Button>
            }
          />
        </div>
      </div>

      {rows.length ? (
        <SegmentsTable data={rows} />
      ) : (
        <EmptyState
          icon={ListFilter}
          title="No segments carved out yet"
          description="Slice your contacts by any criteria — lifecycle, industry, city — so every message lands with the right crowd. Or import a CSV to drop a ready-made list straight in."
        >
          <div className="flex gap-2">
            <SegmentImportSheet
              trigger={
                <Button variant="outline">
                  <Upload className="size-4" /> Import CSV
                </Button>
              }
            />
            <SegmentSheet
              trigger={
                <Button>
                  <Plus className="size-4" /> New segment
                </Button>
              }
            />
          </div>
        </EmptyState>
      )}
    </div>
  );
}
