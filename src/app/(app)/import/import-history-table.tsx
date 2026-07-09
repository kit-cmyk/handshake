"use client";

import * as React from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { FileUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import type { ImportBatch } from "@/lib/types";

export function ImportHistoryTable({ data }: { data: ImportBatch[] }) {
  const columns = React.useMemo<ColumnDef<ImportBatch>[]>(
    () => [
      {
        accessorKey: "created_at",
        header: "When",
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">
            {new Date(getValue() as string).toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "filename",
        header: "File",
        cell: ({ getValue }) => (getValue() as string) ?? "—",
      },
      {
        accessorKey: "target",
        header: "Into",
        cell: ({ getValue }) => (
          <span className="capitalize">{getValue() as string}</span>
        ),
      },
      {
        id: "results",
        header: "Results",
        enableSorting: false,
        cell: ({ row }) => {
          const b = row.original;
          return (
            <div className="flex flex-wrap gap-1">
              <Badge variant="success">{b.created} new</Badge>
              {b.updated > 0 && <Badge variant="default">{b.updated} upd</Badge>}
              {b.skipped > 0 && (
                <Badge variant="secondary">{b.skipped} skip</Badge>
              )}
              {b.errored > 0 && (
                <Badge variant="destructive">{b.errored} err</Badge>
              )}
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      getRowId={(r) => r.id}
      enableSelection
      enableSearch
      searchPlaceholder="Search history…"
      emptyState={
        <EmptyState
          bare
          className="py-10"
          icon={FileUp}
          title="No imports yet"
          description="Upload a CSV above and your import history will show up here — rows added, skipped, and flagged."
        />
      }
    />
  );
}
