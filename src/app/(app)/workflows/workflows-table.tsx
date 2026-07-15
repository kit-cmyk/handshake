"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { Workflow as WorkflowIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { bulkDeleteWorkflows } from "./actions";
import type { WorkflowStatus } from "@/lib/workflows";

export type WorkflowRow = {
  id: string;
  name: string;
  status: WorkflowStatus;
  trigger: string;
  activeRuns: number;
};

const STATUS_VARIANT: Record<
  WorkflowStatus,
  "secondary" | "success" | "warning" | "outline" | "destructive"
> = {
  draft: "secondary",
  running: "success",
  paused: "warning",
  ended: "destructive",
};

const STATUSES: WorkflowStatus[] = ["draft", "running", "paused", "ended"];

export function WorkflowsTable({ data }: { data: WorkflowRow[] }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<string>("all");

  const filtered = React.useMemo(
    () => (status === "all" ? data : data.filter((w) => w.status === status)),
    [data, status],
  );

  const columns = React.useMemo<ColumnDef<WorkflowRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: "trigger",
        header: "Trigger",
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue() as string}</span>
        ),
      },
      { accessorKey: "activeRuns", header: "Active runs" },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={filtered}
      getRowId={(r) => r.id}
      enableSelection
      enableSearch
      searchPlaceholder="Search workflows…"
      onRowClick={(r) => router.push(`/workflows/${r.id}`)}
      toolbar={
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      bulkActions={({ rows, clear }) => (
        <BulkDeleteButton
          ids={rows.map((r) => r.id)}
          action={bulkDeleteWorkflows}
          onDone={clear}
          noun="workflow"
        />
      )}
      emptyState={
        <EmptyState
          bare
          icon={WorkflowIcon}
          title="No robots on duty"
          description="Automate follow-up: when a contact enters a segment, run a sequence of actions."
        />
      }
    />
  );
}
