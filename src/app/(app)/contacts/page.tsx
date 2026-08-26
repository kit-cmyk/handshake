import Link from "next/link";
import { Plus } from "lucide-react";
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
import { PageHeader } from "@/components/page-header";
import { NavButton } from "@/components/nav-button";
import { DESTINATIONS } from "@/lib/nav";
import { ContactsTable } from "./contacts-table";
import { ContactDialog } from "./contact-dialog";
import { detectIssues, FORMATTING_LABELS } from "@/lib/data-quality";
import type { ContactWithCompany } from "@/lib/types";
import {
  parseDefinition,
  evaluateFilter,
  fetchAllEvaluable,
  type Segment,
} from "@/lib/segments";
import { fetchAllRows } from "@/lib/supabase/paginate";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string }>;
}) {
  const { segment: segmentParam } = await searchParams;
  const { supabase, org } = await requireContext();

  const [contacts, { data: companies }, { data: segments }] =
    await Promise.all([
      // Page past PostgREST's 1000-row cap. The table's row count, the issue
      // banner and the lead-source list all describe the whole book, so a
      // truncated read would silently understate every one of them. `id` is a
      // tiebreaker: created_at alone is not unique, and a non-deterministic
      // sort can drop or repeat rows across page boundaries.
      fetchAllRows<ContactWithCompany>((from, to) =>
        supabase
          .from("contacts")
          .select("*, companies(id, name)")
          .eq("org_id", org.id)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to)
      ),
      supabase
        .from("companies")
        .select("id, name")
        .eq("org_id", org.id)
        .order("name"),
      supabase
        .from("segments")
        .select("id, name, type, definition")
        .eq("org_id", org.id)
        // Campaign-managed audience lists aren't user-facing segments.
        .eq("managed", false)
        .order("name"),
    ]);

  const companyOptions = (companies ?? []) as { id: string; name: string }[];
  const allContacts = contacts;
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
      const members = await fetchAllRows<{ contact_id: string }>((from, to) =>
        supabase
          .from("segment_members")
          .select("contact_id")
          .eq("segment_id", selectedSegment.id)
          .order("contact_id")
          .range(from, to)
      );
      memberIds = new Set(members.map((m) => m.contact_id));
    } else {
      // Dynamic: evaluate the filter live (needs company city/industry, so a
      // dedicated evaluable query rather than the list rows).
      const evaluable = await fetchAllEvaluable(supabase, org.id);
      const matched = evaluateFilter(
        evaluable,
        parseDefinition(selectedSegment.definition)
      );
      memberIds = new Set(matched.map((c) => c.id));
    }
    contactRows = allContacts.filter((c) => memberIds.has(c.id));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          selectedSegment ? (
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
          ) : null
        }
        title={DESTINATIONS.contacts.label}
        description={
          selectedSegment
            ? `Viewing contacts in “${selectedSegment.name}”.`
            : DESTINATIONS.contacts.description
        }
        actions={
          <>
            {issueCount > 0 && (
              <NavButton
                to="dataHealth"
                label={`Resolve issues (${issueCount})`}
              />
            )}
            <NavButton to="import" />
            <ContactDialog
              companies={companyOptions}
              leadSources={leadSources}
              trigger={
                <Button>
                  <Plus className="size-4" /> Add contact
                </Button>
              }
            />
          </>
        }
      />

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
