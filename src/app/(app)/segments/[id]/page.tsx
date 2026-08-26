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
import { Pencil, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { SegmentSheet } from "../segment-sheet";
import { SegmentActions, RefreshButton } from "./segment-actions";
import { SegmentMembers, type MemberRow } from "./segment-members";
import {
  parseDefinition,
  describeRule,
  fetchAllEvaluable,
  fetchSegmentMemberIds,
  type Segment,
} from "@/lib/segments";
import { statusLabel } from "@/lib/utils";

/**
 * How many members the page renders inline. The full list is browsable on
 * Contacts — shipping every row of a 50k-member segment to the browser to
 * render a scroll box nobody reads is not worth the payload.
 */
const MEMBER_PAGE = 200;

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
    .eq("org_id", org.id)
    .maybeSingle();
  // A campaign-managed audience list has no standalone page — it's edited from
  // the campaign that owns it.
  if (!segment || (segment as Segment).managed) notFound();

  const seg = segment as Segment;
  const def = parseDefinition(seg.definition);

  // Both reads page past the 1000-row cap. A truncated read here would
  // under-report the member count the whole page is built around.
  const [memberIds, contacts] = await Promise.all([
    fetchSegmentMemberIds(supabase, org.id, seg),
    fetchAllEvaluable(supabase, org.id),
  ]);
  const byId = new Map(contacts.map((c) => [c.id, c]));

  const members: MemberRow[] = memberIds
    .slice(0, MEMBER_PAGE)
    .flatMap((cid) => {
      const c = byId.get(cid);
      if (!c) return [];
      return [
        {
          id: c.id,
          name:
            [c.first_name, c.last_name].filter(Boolean).join(" ") ||
            c.email ||
            "Unnamed contact",
          email: c.email,
          company: c.companies?.name ?? null,
          stage: c.lifecycle_stage,
        },
      ];
    });

  const memberCount = memberIds.length;

  return (
    <div className="space-y-6">
      <PageHeader
        back="segments"
        title={seg.name}
        badge={
          <Badge variant={seg.type === "dynamic" ? "default" : "secondary"}>
            {statusLabel(seg.type)}
          </Badge>
        }
        actions={
          <>
            <SegmentSheet
              segment={seg}
              memberCount={memberCount}
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil className="size-4" /> Edit
                </Button>
              }
            />
            {seg.type === "static" && def.rules.length > 0 && (
              <RefreshButton id={seg.id} />
            )}
            <SegmentActions id={seg.id} name={seg.name} />
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {memberCount} {memberCount === 1 ? "contact" : "contacts"}
          </CardTitle>
          <CardDescription>
            {seg.type === "dynamic"
              ? "Computed live from the filter below."
              : def.rules.length > 0
                ? seg.last_evaluated_at
                  ? `Snapshot from ${new Date(seg.last_evaluated_at).toLocaleString()}`
                  : "Snapshot not taken yet"
                : "A fixed list — these people stay in until you take them out."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {def.rules.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Contacts match {def.match} of:
              </p>
              <div className="flex flex-wrap gap-2">
                {def.rules.map((r, i) => (
                  <Badge key={i} variant="secondary">
                    {describeRule(r)}
                  </Badge>
                ))}
              </div>
            </div>
          ) : seg.type === "dynamic" ? (
            <p className="text-sm text-muted-foreground">
              No filter conditions — this segment includes every contact.
            </p>
          ) : null}

          <Button asChild variant="outline">
            <Link href={`/contacts?segment=${seg.id}`}>
              <Users className="size-4" /> View in Contacts
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
          <CardDescription>
            {seg.type === "dynamic"
              ? "Membership follows the filter — edit the conditions to change who's here."
              : "Add or remove people directly. Removing someone here doesn't delete the contact."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SegmentMembers
            segmentId={seg.id}
            segmentType={seg.type}
            members={members}
            total={memberCount}
          />
        </CardContent>
      </Card>
    </div>
  );
}
