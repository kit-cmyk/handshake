"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { Send } from "lucide-react";
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
import { CampaignStatusMenu } from "./campaign-status-menu";
import { deleteCampaign } from "./actions";
import type { CampaignStatus } from "@/lib/types";

export type CampaignRow = {
  id: string;
  name: string;
  status: CampaignStatus;
  steps: number;
  enrolled: number;
  updated_at: string;
  hasSegment: boolean;
};

const STATUS_VARIANT: Record<
  CampaignStatus,
  "secondary" | "success" | "warning" | "outline" | "destructive"
> = {
  draft: "secondary",
  active: "success",
  paused: "warning",
  archived: "outline",
  ended: "destructive",
};

const STATUSES: CampaignStatus[] = [
  "draft",
  "active",
  "paused",
  "archived",
  "ended",
];

export function CampaignsTable({ data }: { data: CampaignRow[] }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<string>("all");

  const filtered = React.useMemo(
    () => (status === "all" ? data : data.filter((c) => c.status === status)),
    [data, status],
  );

  const columns = React.useMemo<ColumnDef<CampaignRow>[]>(
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
      { accessorKey: "steps", header: "Steps" },
      { accessorKey: "enrolled", header: "Enrolled" },
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
        cell: ({ row }) => (
          // Stop the row's navigation click so the menu can be used in place.
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <CampaignStatusMenu
              campaignId={row.original.id}
              status={row.original.status}
              hasSegment={row.original.hasSegment}
            />
          </div>
        ),
      },
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
      searchPlaceholder="Search campaigns…"
      onRowClick={(r) => router.push(`/campaigns/${r.id}`)}
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
          action={deleteCampaign}
          onDone={clear}
          noun="campaign"
        />
      )}
      emptyState={
        <EmptyState
          bare
          icon={Send}
          title="Your outbox is quiet"
          description="Build a sequence, target a segment, and start landing in inboxes."
        />
      }
    />
  );
}
