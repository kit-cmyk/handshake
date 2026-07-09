import Link from "next/link";
import { Plus, ShieldAlert, Search, UploadCloud } from "lucide-react";
import { requireContext } from "@/lib/context";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ContactsTable } from "./contacts-table";
import { ContactDialog } from "./contact-dialog";
import { detectIssues, FORMATTING_LABELS } from "@/lib/data-quality";
import type { ContactWithCompany } from "@/lib/types";
import {
  parseDefinition,
  evaluateFilter,
  EVALUABLE_SELECT,
  type EvaluableContact,
  type Segment,
} from "@/lib/segments";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string }>;
}) {
  const { segment: segmentParam } = await searchParams;
  const { supabase, org } = await requireContext();

  const [{ data: contacts }, { data: companies }, { data: segments }] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("*, companies(id, name)")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("companies")
        .select("id, name")
        .eq("org_id", org.id)
        .order("name"),
      supabase
        .from("segments")
        .select("id, name, type, definition")
        .eq("org_id", org.id)
        .order("name"),
    ]);

  const companyOptions = (companies ?? []) as { id: string; name: string }[];
  const allContacts = (contacts ?? []) as ContactWithCompany[];
  const segs = (segments ?? []) as Segment[];

  // Issue banner + lead-source combobox reflect the whole book, not the
  // segment view — they aren't scoped by the filter.
  const report = detectIssues(allContacts);
  const issueCount = report.counts.total;

  // Per-contact data-health labels for the table column. Mirrors the badge:
  // significant formatting issues + duplicates, but not missing-phone-only
  // rows (phone is optional, so it stays on the Data health page).
  const health: Record<string, string[]> = {};
  const addLabel = (id: string, label: string) => {
    (health[id] ??= []).push(label);
  };
  for (const f of report.formatting)
    for (const r of f.reasons)
      if (r !== "missing_phone") addLabel(f.contact.id, FORMATTING_LABELS[r]);
  for (const g of [...report.duplicateEmailGroups, ...report.duplicateNameGroups])
    for (const c of g.contacts)
      if (!health[c.id]?.includes("Duplicate")) addLabel(c.id, "Duplicate");
  const leadSources = [
    ...new Set(
      allContacts
        .map((c) => c.lead_source?.trim())
        .filter((s): s is string => !!s)
    ),
  ].sort((a, b) => a.localeCompare(b));

  // Optional: narrow the table to a selected segment's members.
  const selectedSegment =
    (segmentParam && segs.find((s) => s.id === segmentParam)) || null;

  let contactRows = allContacts;
  if (selectedSegment) {
    let memberIds: Set<string>;
    if (selectedSegment.type === "static") {
      const { data: members } = await supabase
        .from("segment_members")
        .select("contact_id")
        .eq("segment_id", selectedSegment.id);
      memberIds = new Set(
        (members ?? []).map((m) => (m as { contact_id: string }).contact_id)
      );
    } else {
      // Dynamic: evaluate the filter live (needs company city/industry, so a
      // dedicated evaluable query rather than the list rows).
      const { data: evaluable } = await supabase
        .from("contacts")
        .select(EVALUABLE_SELECT)
        .eq("org_id", org.id);
      const matched = evaluateFilter(
        (evaluable ?? []) as unknown as EvaluableContact[],
        parseDefinition(selectedSegment.definition)
      );
      memberIds = new Set(matched.map((c) => c.id));
    }
    contactRows = allContacts.filter((c) => memberIds.has(c.id));
  }

  return (
    <div className="space-y-6">
      {selectedSegment && (
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/segments">Segments</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/segments/${selectedSegment.id}`}>
                  {selectedSegment.name}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Contacts</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            {selectedSegment
              ? `Viewing contacts in “${selectedSegment.name}”.`
              : "People in your pipeline."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {issueCount > 0 && (
            <Button variant="outline" asChild>
              <Link href="/contacts/issues">
                <ShieldAlert className="size-4 text-amber-600" />
                Resolve issues ({issueCount})
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href="/prospect">
              <Search className="size-4" /> Find leads
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/import">
              <UploadCloud className="size-4" /> Import
            </Link>
          </Button>
          <ContactDialog
            companies={companyOptions}
            leadSources={leadSources}
            trigger={
              <Button>
                <Plus className="size-4" /> Add contact
              </Button>
            }
          />
        </div>
      </div>

      <ContactsTable
        data={contactRows}
        health={health}
        companies={companyOptions}
        leadSources={leadSources}
        segments={segs.map((s) => ({ id: s.id, name: s.name }))}
        selectedSegmentId={selectedSegment?.id ?? null}
        selectedSegmentName={selectedSegment?.name ?? null}
      />
    </div>
  );
}
