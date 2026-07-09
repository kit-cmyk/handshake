import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext } from "@/lib/context";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { ArrowLeft, Pencil, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentSheet } from "../segment-sheet";
import { RefreshButton, DeleteSegmentButton } from "./segment-actions";
import {
  evaluateFilter,
  parseDefinition,
  fieldDef,
  OPERATOR_LABELS,
  VALUELESS_OPS,
  EVALUABLE_SELECT,
  type EvaluableContact,
  type Rule,
  type Segment,
} from "@/lib/segments";

/** Human-readable one-liner for a single filter rule. */
function ruleText(rule: Rule): string {
  const field = fieldDef(rule.field)?.label ?? rule.field;
  const op = OPERATOR_LABELS[rule.op] ?? rule.op;
  const value = VALUELESS_OPS.includes(rule.op) ? "" : ` ${rule.value ?? ""}`;
  return `${field} ${op}${value}`.trim();
}

export default async function SegmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, org } = await requireContext();

  const { data: segment } = await supabase
    .from("segments")
    .select("*")
    .eq("id", id)
    .single();
  if (!segment) notFound();

  const seg = segment as Segment;
  const def = parseDefinition(seg.definition);

  // Member count only — the people themselves are browsed on the Contacts page.
  let memberCount = 0;
  if (seg.type === "static") {
    const { count } = await supabase
      .from("segment_members")
      .select("id", { count: "exact", head: true })
      .eq("segment_id", id);
    memberCount = count ?? 0;
  } else {
    const { data } = await supabase
      .from("contacts")
      .select(EVALUABLE_SELECT)
      .eq("org_id", org.id);
    memberCount = evaluateFilter(
      (data ?? []) as unknown as EvaluableContact[],
      def
    ).length;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/segments"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to segments
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{seg.name}</h1>
          <Badge variant={seg.type === "dynamic" ? "default" : "secondary"}>
            {seg.type}
          </Badge>
        </div>
        <div className="flex gap-2">
          <SegmentSheet
            segment={seg}
            trigger={
              <Button variant="outline" size="sm">
                <Pencil className="size-4" /> Edit
              </Button>
            }
          />
          {seg.type === "static" && def.rules.length > 0 && (
            <RefreshButton id={seg.id} />
          )}
          <DeleteSegmentButton id={seg.id} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {memberCount} {memberCount === 1 ? "contact" : "contacts"}
          </CardTitle>
          <CardDescription>
            {seg.type === "dynamic"
              ? "Computed live from the filter below."
              : seg.last_evaluated_at
                ? `Snapshot from ${new Date(seg.last_evaluated_at).toLocaleString()}`
                : "Static list"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {seg.type === "dynamic" &&
            (def.rules.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Contacts match {def.match} of:
                </p>
                <div className="flex flex-wrap gap-2">
                  {def.rules.map((r, i) => (
                    <Badge key={i} variant="secondary">
                      {ruleText(r)}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No filter conditions — this segment includes every contact.
              </p>
            ))}

          <Button asChild>
            <Link href={`/contacts?segment=${seg.id}`}>
              <Users className="size-4" /> View contacts
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
