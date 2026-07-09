"use client";

import * as React from "react";
import { Combobox as Base } from "@base-ui/react/combobox";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { value: string; label: string; creatable?: boolean };

export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
  allowCreate = false,
  className,
  id,
}: {
  /** Current string value ("" when nothing selected). */
  value: string;
  onValueChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Offer a "Create '<query>'" row when the search matches nothing. */
  allowCreate?: boolean;
  className?: string;
  id?: string;
}) {
  const [query, setQuery] = React.useState("");

  const base = React.useMemo<Item[]>(
    () => options.map((o) => ({ value: o, label: o })),
    [options]
  );

  const trimmed = query.trim();
  const hasExact = base.some(
    (i) => i.label.toLowerCase() === trimmed.toLowerCase()
  );
  const items: Item[] =
    allowCreate && trimmed && !hasExact
      ? [...base, { value: trimmed, label: trimmed, creatable: true }]
      : base;

  const selected: Item | null = value ? { value, label: value } : null;

  return (
    <Base.Root
      items={items}
      value={selected}
      onValueChange={(next: Item | null) => {
        onValueChange(next?.value ?? "");
        setQuery("");
      }}
      inputValue={query}
      onInputValueChange={(v: string) => setQuery(v)}
      itemToStringLabel={(item: Item) => item.label}
      itemToStringValue={(item: Item) => item.value}
      isItemEqualToValue={(a: Item, b: Item) => a.value === b.value}
    >
      <Base.Trigger
        id={id}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <Base.Value placeholder={placeholder}>
          {(v: Item | null) =>
            v ? (
              <span className="truncate">{v.label}</span>
            ) : (
              <span className="truncate text-muted-foreground">
                {placeholder}
              </span>
            )
          }
        </Base.Value>
        <Base.Icon>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Base.Icon>
      </Base.Trigger>

      <Base.Portal>
        {/* pointer-events-auto keeps the popup interactive even when an open
            modal dialog (Sheet) has locked pointer events on the body. */}
        <Base.Positioner
          align="start"
          sideOffset={4}
          className="z-50 pointer-events-auto"
        >
          <Base.Popup className="max-h-72 w-[var(--anchor-width)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
            <div className="border-b p-1">
              <Base.Input
                placeholder={searchPlaceholder}
                className="h-8 w-full rounded-sm bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Base.Empty className="px-3 py-4 text-sm text-muted-foreground">
              {emptyText}
            </Base.Empty>
            <Base.List className="max-h-56 overflow-auto p-1">
              {(item: Item) => (
                <Base.Item
                  key={item.value}
                  value={item}
                  className="flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                >
                  {item.creatable ? (
                    <>
                      <Plus className="size-4 shrink-0" />
                      <span>
                        Create “{item.label}”
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="flex size-4 shrink-0 items-center justify-center">
                        <Base.ItemIndicator>
                          <Check className="size-4" />
                        </Base.ItemIndicator>
                      </span>
                      <span className="truncate">{item.label}</span>
                    </>
                  )}
                </Base.Item>
              )}
            </Base.List>
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
