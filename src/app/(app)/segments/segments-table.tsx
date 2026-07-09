"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import {
  ListFilter,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { SegmentSheet } from "./segment-sheet";
import { deleteSegment, refreshSnapshot } from "./actions";
import { parseDefinition, type Segment } from "@/lib/segments";

export type SegmentRow = {
  id: string;
  name: string;
  type: "static" | "dynamic";
  members: number;
  updated_at: string;
  /** Full segment, for the row actions (edit/refresh). */
  segment: Segment;
};

export function SegmentsTable({ data }: { data: SegmentRow[] }) {
  const router = useRouter();
  const [type, setType] = React.useState<string>("all");

  const filtered = React.useMemo(
    () => (type === "all" ? data : data.filter((s) => s.type === type)),
    [data, type],
  );

  const columns = React.useMemo<ColumnDef<SegmentRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge
            variant={row.original.type === "dynamic" ? "default" : "secondary"}
          >
            {row.original.type}
          </Badge>
        ),
      },
      { accessorKey: "members", header: "Members" },
      {
        accessorKey: "updated_at",
        header: "Updated",
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">
            {new Date(getValue() as string).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const seg = row.original.segment;
          const canRefresh =
            seg.type === "static" &&
            parseDefinition(seg.definition).rules.length > 0;
          return (
            <div
              className="flex justify-end"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() =>
                      router.push(`/contacts?segment=${row.original.id}`)
                    }
                  >
                    <Users className="size-4" /> View contacts
                  </DropdownMenuItem>
                  <SegmentSheet
                    segment={seg}
                    trigger={
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <Pencil className="size-4" /> Edit
                      </DropdownMenuItem>
                    }
                  />
                  {canRefresh && (
                    <DropdownMenuItem
                      onSelect={async () => {
                        await refreshSnapshot(seg.id);
                        router.refresh();
                      }}
                    >
                      <RefreshCw className="size-4" /> Refresh snapshot
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <ConfirmDialog
                    trigger={
                      <DropdownMenuItem
                        className="text-destructive"
                        onSelect={(e) => e.preventDefault()}
                      >
                        <Trash2 className="size-4" /> Delete
                      </DropdownMenuItem>
                    }
                    title="Delete segment?"
                    description="This permanently deletes the segment. Contacts themselves are not affected. This can't be undone."
                    onConfirm={async () => {
                      await deleteSegment(row.original.id);
                      router.refresh();
                    }}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [router],
  );

  return (
    <DataTable
      columns={columns}
      data={filtered}
      getRowId={(r) => r.id}
      enableSelection
      enableSearch
      searchPlaceholder="Search segments…"
      onRowClick={(r) => router.push(`/contacts?segment=${r.id}`)}
      toolbar={
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="dynamic">Dynamic</SelectItem>
            <SelectItem value="static">Static</SelectItem>
          </SelectContent>
        </Select>
      }
      bulkActions={({ rows, clear }) => (
        <BulkDeleteButton
          ids={rows.map((r) => r.id)}
          action={deleteSegment}
          onDone={clear}
          noun="segment"
        />
      )}
      emptyState={
        <EmptyState
          bare
          icon={ListFilter}
          title="No segments carved out yet"
          description="Slice your contacts by any criteria — lifecycle, industry, city — so every message lands with the right crowd."
        />
      }
    />
  );
}
