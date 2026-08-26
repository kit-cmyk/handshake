"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
  SearchX,
  AlertTriangle,
  CheckCircle2,
  BellOff,
  UserRoundCog,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/data-table";
import { BulkDeleteButton } from "@/components/bulk-delete-button";
import { useBulkTask } from "@/components/bulk-task";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { LifecycleBadge } from "@/components/lifecycle-badge";
import { ContactDialog } from "./contact-dialog";
import { ContactSheet } from "./contact-sheet";
import { bulkAssignOwner, bulkDeleteContacts, deleteContact } from "./actions";
import {
  contactName,
  LIFECYCLE_LABELS,
  type ContactWithCompany,
  type LifecycleStage,
} from "@/lib/types";

type CompanyOption = { id: string; name: string };
type SegmentOption = { id: string; name: string };
type OwnerOption = { id: string; name: string };

const UNASSIGNED = "Unassigned";

const ALL_SEGMENTS = "__all_segments";

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

/** Segment picker that scopes the list to one segment's members via the URL. */
function SegmentFilter({
  segments,
  selectedId,
}: {
  segments: SegmentOption[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Select
      value={selectedId ?? ALL_SEGMENTS}
      onValueChange={(v) =>
        router.push(v === ALL_SEGMENTS ? pathname : `${pathname}?segment=${v}`)
      }
    >
      <SelectTrigger className="h-9 w-[180px]">
        <SelectValue placeholder="All contacts" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_SEGMENTS}>All contacts</SelectItem>
        {segments.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Reassigns the selected contacts to one owner via the chunked background task
 * runner, the same path `BulkDeleteButton` uses, so a large selection does not
 * become one enormous request.
 */
function BulkAssignOwner({
  ids,
  owners,
  onDone,
}: {
  ids: string[];
  owners: OwnerOption[];
  onDone?: () => void;
}) {
  const bulk = useBulkTask();

  const assign = (ownerId: string | null) => {
    void bulk.run({
      ids,
      noun: "contact",
      action: (chunk: string[]) => bulkAssignOwner(chunk, ownerId),
      verb: "Assigning",
      doneVerb: "Assigned",
      onDone,
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8" disabled={bulk.running}>
          <UserRoundCog className="size-4" /> Assign owner
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {owners.map((o) => (
          <DropdownMenuItem key={o.id} onSelect={() => assign(o.id)}>
            {o.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => assign(null)}>
          {UNASSIGNED}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ContactsTable({
  data,
  health = {},
  companies,
  leadSources = [],
  owners = [],
  segments = [],
  selectedSegmentId = null,
  selectedSegmentName = null,
}: {
  data: ContactWithCompany[];
  /** Per-contact data-health labels, keyed by contact id. Empty = healthy. */
  health?: Record<string, string[]>;
  companies: CompanyOption[];
  leadSources?: string[];
  /** Org members who can own a contact. Empty hides the column and bulk action. */
  owners?: OwnerOption[];
  segments?: SegmentOption[];
  selectedSegmentId?: string | null;
  selectedSegmentName?: string | null;
}) {
  const router = useRouter();
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const ownerNameById = React.useMemo(
    () => new Map(owners.map((o) => [o.id, o.name])),
    [owners],
  );

  const columns = React.useMemo<ColumnDef<ContactWithCompany>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        accessorFn: (r) => contactName(r),
        cell: ({ row }) => (
          <span className="font-medium">{contactName(row.original)}</span>
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => {
          // Opting out makes the address unusable, so it belongs next to the
          // address rather than in the lifecycle column — `unsubscribed_at` is
          // a separate flag from the "unsubscribed" lifecycle stage. Campaign
          // enrollment silently skips these contacts (see lib/campaigns/
          // enroll.ts), so without this the row looks perfectly mailable.
          const email = row.original.email;
          const optedOut = !!row.original.unsubscribed_at;
          return (
            <span className="flex items-center gap-2">
              <span
                className={
                  optedOut
                    ? "text-muted-foreground line-through"
                    : "text-muted-foreground"
                }
              >
                {email || "—"}
              </span>
              {optedOut && (
                <Badge
                  variant="destructive"
                  className="gap-1"
                  title={`Unsubscribed ${fmtDate(row.original.unsubscribed_at)} — excluded from all campaigns`}
                >
                  <BellOff className="size-3" />
                  Unsubscribed
                </Badge>
              )}
            </span>
          );
        },
      },
      {
        id: "company",
        header: "Company",
        accessorFn: (r) => r.companies?.name ?? "",
        cell: ({ row }) => row.original.companies?.name ?? "—",
      },
      {
        id: "owner",
        header: "Owner",
        // Resolve to the display name so search, sorting and the facet all work
        // off what is on screen rather than a uuid. Unowned rows get a real
        // label so "Unassigned" is a filterable value, not an empty cell.
        accessorFn: (r) =>
          (r.owner_id && ownerNameById.get(r.owner_id)) || UNASSIGNED,
        cell: ({ row }) => {
          const name =
            row.original.owner_id &&
            ownerNameById.get(row.original.owner_id);
          return name ? (
            <span>{name}</span>
          ) : (
            <span className="text-muted-foreground">{UNASSIGNED}</span>
          );
        },
      },
      {
        accessorKey: "lifecycle_stage",
        header: "Stage",
        cell: ({ row }) => (
          <LifecycleBadge stage={row.original.lifecycle_stage} />
        ),
      },
      {
        id: "health",
        header: "Data health",
        // Sort unhealthy rows to the top (by issue count).
        accessorFn: (r) => health[r.id]?.length ?? 0,
        cell: ({ row }) => {
          const labels = health[row.original.id];
          if (!labels?.length) {
            return (
              <span
                className="inline-flex items-center text-muted-foreground/60"
                title="No data issues"
              >
                <CheckCircle2 className="size-4" />
              </span>
            );
          }
          return (
            <Link
              href="/contacts/issues"
              onClick={(e) => e.stopPropagation()}
              title={labels.join(", ")}
            >
              <Badge variant="warning" className="gap-1 hover:opacity-80">
                <AlertTriangle className="size-3" />
                {labels.length} {labels.length === 1 ? "issue" : "issues"}
              </Badge>
            </Link>
          );
        },
      },
      {
        accessorKey: "appointment_date",
        header: "Appointment",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {fmtDate(row.original.appointment_date)}
          </span>
        ),
      },
      {
        accessorKey: "created_at",
        header: "Date added",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {fmtDate(row.original.created_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <ContactDialog
                  companies={companies}
                  contact={row.original}
                  leadSources={leadSources}
                  owners={owners}
                  trigger={
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Pencil className="size-4" /> Edit
                    </DropdownMenuItem>
                  }
                />
                <ConfirmDialog
                  trigger={
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={(e) => e.preventDefault()}
                    >
                      <Trash2 className="size-4" /> Delete
                    </DropdownMenuItem>
                  }
                  title="Delete contact?"
                  description={`This permanently deletes ${contactName(
                    row.original,
                  )} and their activity. This can't be undone.`}
                  onConfirm={async () => {
                    await deleteContact(row.original.id);
                    router.refresh();
                  }}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [companies, leadSources, router, health, owners, ownerNameById],
  );

  return (
    <>
    <DataTable
      columns={columns}
      data={data}
      getRowId={(r) => r.id}
      enableSelection
      enableSearch
      searchPlaceholder="Search contacts…"
      facets={[
        {
          columnId: "lifecycle_stage",
          title: "Stage",
          format: (v) => LIFECYCLE_LABELS[v as LifecycleStage] ?? v,
        },
        { columnId: "company", title: "Company", searchable: true },
        ...(owners.length
          ? [{ columnId: "owner", title: "Owner", searchable: true }]
          : []),
      ]}
      onRowClick={(r) => {
        setActiveId(r.id);
        setSheetOpen(true);
      }}
      toolbar={
        segments.length > 0 ? (
          <SegmentFilter segments={segments} selectedId={selectedSegmentId} />
        ) : undefined
      }
      bulkActions={({ rows, clear }) => (
        <>
          {owners.length > 0 && (
            <BulkAssignOwner
              ids={rows.map((r) => r.id)}
              owners={owners}
              onDone={clear}
            />
          )}
          <BulkDeleteButton
            ids={rows.map((r) => r.id)}
            action={bulkDeleteContacts}
            onDone={clear}
            noun="contact"
          />
        </>
      )}
      emptyState={
        selectedSegmentId ? (
          <EmptyState
            bare
            icon={Users}
            title="No contacts in this segment"
            description={
              selectedSegmentName
                ? `“${selectedSegmentName}” has no members yet. Pick another segment or clear the filter to see everyone.`
                : "This segment has no members yet."
            }
          />
        ) : (
          <EmptyState
            bare
            icon={Users}
            title="Your rolodex is empty"
            description="Every deal starts with a person. Add one by hand, import a CSV, or go scout some fresh leads."
          />
        )
      }
      searchEmptyState={
        <EmptyState
          bare
          icon={SearchX}
          title="No contacts match that"
          description="Try a broader search."
        />
      }
    />
    {activeId && (
      <ContactSheet
        key={activeId}
        contactId={activeId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        companies={companies}
        leadSources={leadSources}
        owners={owners}
      />
    )}
    </>
  );
}
