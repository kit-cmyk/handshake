"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type PaginationState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import {
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  ChevronsUpDown,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const ALL_FACET = "__all";

/** A column the user can filter to a single value via a dropdown. */
export interface DataTableFacet {
  /** Must match a column `id` / `accessorKey`. */
  columnId: string;
  /** Label shown in the dropdown (and as the "all" option). */
  title: string;
  /** Optional display formatter for raw column values. */
  format?: (value: string) => string;
  /**
   * Render a searchable combobox instead of a plain select — use for
   * high-cardinality columns (e.g. company). Ignores `format`: the raw
   * column value is both the shown label and the filter value.
   */
  searchable?: boolean;
}

export interface DataTableProps<TData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<TData, any>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  onRowClick?: (row: TData) => void;
  /** Show the leading selection checkbox column. */
  enableSelection?: boolean;
  /** Show the global search box in the toolbar. */
  enableSearch?: boolean;
  searchPlaceholder?: string;
  /** Dropdown filters for specific columns (rendered in the toolbar). */
  facets?: DataTableFacet[];
  /** Right-aligned filter controls (rendered before the search box). */
  toolbar?: React.ReactNode;
  /** Rendered on the left of the toolbar when rows are selected. */
  bulkActions?: (ctx: { rows: TData[]; clear: () => void }) => React.ReactNode;
  initialPageSize?: number;
  pageSizeOptions?: number[];
  /** Shown when there is no data at all. */
  emptyState?: React.ReactNode;
  /** Shown when a search/filter hides everything. */
  searchEmptyState?: React.ReactNode;
}

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  onRowClick,
  enableSelection = false,
  enableSearch = false,
  searchPlaceholder = "Search…",
  facets,
  toolbar,
  bulkActions,
  initialPageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  emptyState,
  searchEmptyState,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize,
  });

  const selectColumn = React.useMemo<ColumnDef<TData>>(
    () => ({
      id: "__select",
      enableSorting: false,
      size: 36,
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all rows on this page"
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? "indeterminate"
                : false
          }
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(v)}
        />
      ),
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            aria-label="Select row"
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(v)}
          />
        </div>
      ),
    }),
    [],
  );

  const finalColumns = React.useMemo(
    () => (enableSelection ? [selectColumn, ...columns] : columns),
    [enableSelection, selectColumn, columns],
  );

  const table = useReactTable({
    data,
    columns: finalColumns,
    state: { sorting, globalFilter, columnFilters, rowSelection, pagination },
    getRowId,
    enableRowSelection: enableSelection,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const selectedRows = table
    .getSelectedRowModel()
    .rows.map((r) => r.original);
  const selectedCount = selectedRows.length;
  const clearSelection = () => setRowSelection({});

  const colCount = table.getVisibleLeafColumns().length;
  const pageCount = table.getPageCount();
  const { pageIndex, pageSize } = table.getState().pagination;
  const totalRows = table.getFilteredRowModel().rows.length;

  const showToolbar =
    enableSearch || !!toolbar || enableSelection || (facets?.length ?? 0) > 0;

  return (
    <div className="space-y-3">
      {showToolbar ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left: contextual bulk actions */}
          <div className="flex min-h-9 items-center gap-2">
            {selectedCount > 0 ? (
              <>
                <span className="text-sm font-medium">
                  {selectedCount} selected
                </span>
                {bulkActions?.({ rows: selectedRows, clear: clearSelection })}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={clearSelection}
                >
                  <X className="size-4" /> Clear
                </Button>
              </>
            ) : null}
          </div>

          {/* Right: filters + search, all h-9 */}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {facets?.map((f) => {
              const col = table.getColumn(f.columnId);
              if (!col) return null;
              const values = Array.from(col.getFacetedUniqueValues().keys())
                .filter((v) => v != null && v !== "")
                .map(String)
                .sort((a, b) => a.localeCompare(b));

              if (f.searchable) {
                const allLabel = `All ${f.title.toLowerCase()}`;
                const selected = (col.getFilterValue() as string) ?? "";
                return (
                  <Combobox
                    key={f.columnId}
                    className="h-9 w-[200px]"
                    value={selected}
                    onValueChange={(v) =>
                      col.setFilterValue(v && v !== allLabel ? v : undefined)
                    }
                    options={[allLabel, ...values]}
                    placeholder={allLabel}
                    searchPlaceholder={`Search ${f.title.toLowerCase()}…`}
                    emptyText={`No ${f.title.toLowerCase()} match.`}
                  />
                );
              }

              const current = (col.getFilterValue() as string) ?? ALL_FACET;
              return (
                <Select
                  key={f.columnId}
                  value={current}
                  onValueChange={(v) =>
                    col.setFilterValue(v === ALL_FACET ? undefined : v)
                  }
                >
                  <SelectTrigger className="h-9 w-[160px]">
                    <SelectValue placeholder={f.title} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FACET}>
                      All {f.title.toLowerCase()}
                    </SelectItem>
                    {values.map((v) => (
                      <SelectItem key={v} value={v}>
                        {f.format ? f.format(v) : v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              );
            })}
            {toolbar}
            {enableSearch ? (
              <Input
                placeholder={searchPlaceholder}
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="h-9 w-[200px] lg:w-[260px]"
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border">
        <Table containerClassName="max-h-[70vh]">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => {
                  const canSort = h.column.getCanSort();
                  const sorted = h.column.getIsSorted();
                  return (
                    <TableHead
                      key={h.id}
                      className={cn(
                        "sticky top-0 z-20 border-b bg-background",
                        h.column.id === "__select" && "w-9",
                      )}
                    >
                      {h.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground"
                        >
                          {flexRender(
                            h.column.columnDef.header,
                            h.getContext(),
                          )}
                          {sorted === "asc" ? (
                            <ArrowUp className="size-3.5" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3.5" />
                          ) : (
                            <ChevronsUpDown className="size-3.5 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={onRowClick ? "cursor-pointer" : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colCount} className="p-0">
                  {data.length === 0
                    ? (emptyState ?? (
                        <p className="py-12 text-center text-sm text-muted-foreground">
                          Nothing here yet.
                        </p>
                      ))
                    : (searchEmptyState ?? (
                        <p className="py-12 text-center text-sm text-muted-foreground">
                          No results match your filters.
                        </p>
                      ))}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer: selection count + pagination */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {enableSelection && selectedCount > 0
            ? `${selectedCount} of ${totalRows} row(s) selected.`
            : `${totalRows} row${totalRows === 1 ? "" : "s"}.`}
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => table.setPageSize(Number(v))}
            >
              <SelectTrigger className="h-8 w-[72px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-sm text-muted-foreground">
            Page {pageCount === 0 ? 0 : pageIndex + 1} of {pageCount}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              aria-label="First page"
            >
              <ChevronsLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.setPageIndex(pageCount - 1)}
              disabled={!table.getCanNextPage()}
              aria-label="Last page"
            >
              <ChevronsRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
