"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Copy,
  Download,
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
import { EmptyState } from "@/components/empty-state";
import { SegmentSheet } from "./segment-sheet";
import {
  DeleteSegmentDialog,
  useSegmentDuplicate,
  useSegmentExport,
} from "./segment-row-actions";
import { bulkDeleteSegments, refreshSnapshot } from "./actions";
import { type Segment } from "@/lib/segments";
import { statusLabel } from "@/lib/utils";

export type SegmentRow = {
  id: string;
  name: string;
  type: "static" | "dynamic";
  members: number;
  /** How many filter conditions the definition holds. */
  rules: number;
  updated_at: string;
  last_evaluated_at: string | null;
  /** Full segment, for the row actions (edit/refresh). */
  segment: Segment;
};

export function SegmentsTable({ data }: { data: SegmentRow[] }) {
  const router = useRouter();
  const [type, setType] = React.useState<string>("all");
  const exporter = useSegmentExport();
  const duplicator = useSegmentDuplicate();

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
            {statusLabel(row.original.type)}
          </Badge>
        ),
      },
      { accessorKey: "members", header: "Members" },
      {
        accessorKey: "last_evaluated_at",
        header: "Members from",
        cell: ({ row }) => {
          const r = row.original;
          // A dynamic segment is recomputed on read, so its membership is never
          // stale — only a static snapshot has an age worth showing.
          if (r.type === "dynamic")
            return <span className="text-muted-foreground">Live</span>;
          return (
            <span className="text-muted-foreground">
              {r.last_evaluated_at
                ? new Date(r.last_evaluated_at).toLocaleDateString()
                : "—"}
            </span>
          );
        },
      },
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
          const r = row.original;
          const seg = r.segment;
          // Re-running a snapshot only means something when there's a filter to
          // re-run; a hand-built or imported list has nothing to re-evaluate.
          const canRefresh = seg.type === "static" && r.rules > 0;
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
                    onSelect={() => router.push(`/contacts?segment=${r.id}`)}
                  >
                    <Users className="size-4" /> View contacts
                  </DropdownMenuItem>
                  <SegmentSheet
                    segment={seg}
                    memberCount={r.members}
                    trigger={
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <Pencil className="size-4" /> Edit
                      </DropdownMenuItem>
                    }
                  />
                  <DropdownMenuItem
                    disabled={duplicator.pending}
                    onSelect={() => void duplicator.run(r.id)}
                  >
                    <Copy className="size-4" /> Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={exporter.pending}
                    onSelect={() => void exporter.run(r.id)}
                  >
                    <Download className="size-4" /> Export CSV
                  </DropdownMenuItem>
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
                  <DeleteSegmentDialog
                    id={r.id}
                    name={r.name}
                    onDeleted={() => router.refresh()}
                    trigger={
                      <DropdownMenuItem
                        className="text-destructive"
                        onSelect={(e) => e.preventDefault()}
                      >
                        <Trash2 className="size-4" /> Delete
                      </DropdownMenuItem>
                    }
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [router, exporter, duplicator],
  );

  return (
    <div className="space-y-2">
      {exporter.error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {exporter.error}
        </p>
      )}
      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(r) => r.id}
        enableSelection
        enableSearch
        searchPlaceholder="Search segments…"
        onRowClick={(r) => router.push(`/segments/${r.id}`)}
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
            action={bulkDeleteSegments}
            onDone={clear}
            noun="segment"
          />
        )}
        emptyState={
          <EmptyState
            bare
            icon={ListFilter}
            title="No segments carved out yet"
            description="Slice your contacts by any criteria — lifecycle, city, industry, when they were added — so every message lands with the right crowd."
          />
        }
      />
    </div>
  );
}
