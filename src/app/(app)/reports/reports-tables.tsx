"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { Send, Workflow as WorkflowIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";

export type CampaignReportRow = {
  id: string;
  name: string;
  status: string;
  enrolled: number;
  sent: number;
  openRate: number;
  replyRate: number;
};

export type WorkflowReportRow = {
  id: string;
  name: string;
  status: string;
  total: number;
  completed: number;
  completionRate: number;
};

export function CampaignReportTable({ data }: { data: CampaignReportRow[] }) {
  const router = useRouter();
  const columns = React.useMemo<ColumnDef<CampaignReportRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Campaign",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant="secondary">{row.original.status}</Badge>,
      },
      { accessorKey: "enrolled", header: "Enrolled" },
      { accessorKey: "sent", header: "Sent" },
      {
        accessorKey: "openRate",
        header: "Open rate",
        cell: ({ getValue }) => (
          <span className="tabular-nums">{getValue() as number}%</span>
        ),
      },
      {
        accessorKey: "replyRate",
        header: "Reply rate",
        cell: ({ getValue }) => (
          <span className="tabular-nums">{getValue() as number}%</span>
        ),
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
      searchPlaceholder="Search campaigns…"
      onRowClick={(r) => router.push(`/reports/${r.id}`)}
      emptyState={
        <EmptyState
          bare
          icon={Send}
          title="Nothing to report on — yet"
          description="Launch a campaign and this is where opens, clicks, and replies will stack up."
        />
      }
    />
  );
}

export function WorkflowReportTable({ data }: { data: WorkflowReportRow[] }) {
  const router = useRouter();
  const columns = React.useMemo<ColumnDef<WorkflowReportRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Workflow",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant="secondary">{row.original.status}</Badge>,
      },
      { accessorKey: "total", header: "Total runs" },
      { accessorKey: "completed", header: "Completed" },
      {
        accessorKey: "completionRate",
        header: "Completion rate",
        cell: ({ getValue }) => (
          <span className="tabular-nums">{getValue() as number}%</span>
        ),
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
      searchPlaceholder="Search workflows…"
      onRowClick={(r) => router.push(`/reports/workflow/${r.id}`)}
      emptyState={
        <EmptyState
          bare
          icon={WorkflowIcon}
          title="No automations to measure"
          description="Once a workflow starts running, its completion rates will show up right here."
        />
      }
    />
  );
}
