"use client";

import * as React from "react";
import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import { Radar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import type { ScrapeJob } from "@/lib/types";

export function ProspectHistoryTable({ data }: { data: ScrapeJob[] }) {
  const columns = React.useMemo<ColumnDef<ScrapeJob>[]>(
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
        id: "search",
        header: "Search",
        accessorFn: (r) => `${r.category} ${r.location}`,
        cell: ({ row }) => (
          <>
            {row.original.category}{" "}
            <span className="text-muted-foreground">
              · {row.original.location}
            </span>
          </>
        ),
      },
      {
        accessorKey: "provider",
        header: "Source",
        cell: ({ getValue }) => (
          <span className="capitalize">{getValue() as string}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Results",
        enableSorting: false,
        cell: ({ row }) => {
          const j = row.original;
          return j.status === "completed" ? (
            <div className="flex flex-wrap gap-1">
              <Badge variant="success">{j.imported} new</Badge>
              {j.contacts > 0 && (
                <Badge variant="default">{j.contacts} contacts</Badge>
              )}
              {j.deduped > 0 && (
                <Badge variant="secondary">{j.deduped} dup</Badge>
              )}
            </div>
          ) : j.status === "failed" ? (
            <Badge variant="destructive">failed</Badge>
          ) : (
            <Badge variant="secondary">{j.status}</Badge>
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
      initialPageSize={10}
      emptyState={
        <EmptyState
          bare
          className="py-10"
          icon={Radar}
          title="No searches yet"
          description={
            <>
              Run a search above and fresh leads will land straight in{" "}
              <Link href="/companies" className="underline">
                Companies
              </Link>
              .
            </>
          }
        />
      }
    />
  );
}
