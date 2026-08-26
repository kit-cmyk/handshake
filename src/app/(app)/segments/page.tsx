import { Plus, ListFilter, Upload } from "lucide-react";
import { requireContext } from "@/lib/context";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { DESTINATIONS } from "@/lib/nav";
import { SegmentSheet } from "./segment-sheet";
import { SegmentImportSheet } from "./segment-import-sheet";
import { EmptyState } from "@/components/empty-state";
import { SegmentsTable, type SegmentRow } from "./segments-table";
import { fetchAllRows } from "@/lib/supabase/paginate";
import {
  evaluateFilter,
  parseDefinition,
  fetchAllEvaluable,
  type EvaluableContact,
  type Segment,
} from "@/lib/segments";

export default async function SegmentsPage() {
  const { supabase, org } = await requireContext();

  const [{ data: segments }, members, contacts] = await Promise.all([
    supabase
      .from("segments")
      .select("*")
      .eq("org_id", org.id)
      // Campaign-managed audience lists are an implementation detail of the
      // campaign that owns them — they're not user-editable segments.
      .eq("managed", false)
      .order("created_at", { ascending: false }),
    // Both of these have to see every row: a truncated read would silently
    // understate the member counts this page exists to show. `segment_members`
    // crosses the 1000-row cap on the org's *total* membership, not per segment.
    fetchAllRows<{ segment_id: string }>((from, to) =>
      supabase
        .from("segment_members")
        .select("segment_id, id")
        .eq("org_id", org.id)
        .order("id")
        .range(from, to)
    ),
    fetchAllEvaluable(supabase, org.id),
  ]);

  const segs = (segments ?? []) as Segment[];
  const evaluable = contacts as EvaluableContact[];

  // Static counts from cached membership; dynamic counts computed live.
  const staticCounts = new Map<string, number>();
  for (const m of members) {
    staticCounts.set(m.segment_id, (staticCounts.get(m.segment_id) ?? 0) + 1);
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
    rules: parseDefinition(s.definition).rules.length,
    updated_at: s.updated_at,
    last_evaluated_at: s.last_evaluated_at,
    segment: s,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={DESTINATIONS.segments.label}
        description={DESTINATIONS.segments.description}
        actions={
          <>
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
          </>
        }
      />

      {rows.length ? (
        <SegmentsTable data={rows} />
      ) : (
        <EmptyState
          icon={ListFilter}
          title="No segments carved out yet"
          description="Slice your contacts by any criteria — lifecycle, city, industry, when they were added — so every message lands with the right crowd. Or import a CSV to drop a ready-made list straight in."
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
