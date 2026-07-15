"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Building2,
  SearchX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable } from "@/components/data-table";
import { BulkDeleteButton } from "@/components/bulk-delete-button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { CompanyDialog } from "./company-dialog";
import { CompanySheet } from "./company-sheet";
import { bulkDeleteCompanies, deleteCompany } from "./actions";
import type { Company } from "@/lib/types";

export function CompaniesTable({ data }: { data: Company[] }) {
  const router = useRouter();
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const columns = React.useMemo<ColumnDef<Company>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        id: "type",
        header: "Industry / Category",
        accessorFn: (r) => r.industry ?? r.category ?? "",
        cell: ({ row }) =>
          row.original.industry ?? row.original.category ?? "—",
      },
      {
        accessorKey: "city",
        header: "City",
        cell: ({ getValue }) => (getValue() as string) || "—",
      },
      {
        id: "web",
        header: "Website",
        accessorFn: (r) => r.website ?? r.domain ?? "",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.website ?? row.original.domain ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "employee_count",
        header: "Employees",
        cell: ({ getValue }) => (getValue() as number) ?? "—",
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
                <CompanyDialog
                  company={row.original}
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
                  title="Delete company?"
                  description={`This permanently deletes ${row.original.name}. This can't be undone.`}
                  onConfirm={async () => {
                    await deleteCompany(row.original.id);
                    router.refresh();
                  }}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [router],
  );

  return (
    <>
    <DataTable
      columns={columns}
      data={data}
      getRowId={(r) => r.id}
      enableSelection
      enableSearch
      searchPlaceholder="Search companies…"
      onRowClick={(r) => {
        setActiveId(r.id);
        setSheetOpen(true);
      }}
      bulkActions={({ rows, clear }) => (
        <BulkDeleteButton
          ids={rows.map((r) => r.id)}
          action={bulkDeleteCompanies}
          onDone={clear}
          noun="company"
        />
      )}
      emptyState={
        <EmptyState
          bare
          icon={Building2}
          title="No companies on the board"
          description="Accounts you're targeting live here. Add one, or let lead scraping fill the list for you."
        />
      }
      searchEmptyState={
        <EmptyState
          bare
          icon={SearchX}
          title="No companies match that"
          description="Try a broader search."
        />
      }
    />
    {activeId && (
      <CompanySheet
        key={activeId}
        companyId={activeId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    )}
    </>
  );
}
