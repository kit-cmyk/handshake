"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Minimal, dependency-free accordion. Each item manages its own open state, so
 * multiple can be open at once (no exclusive-selection coordination needed).
 */
export function Accordion({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-3", className)}>{children}</div>;
}

export function AccordionItem({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode;
  /** Optional badge value shown next to the title. */
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          {title}
          {typeof count === "number" && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
              {count}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && <div className="border-t p-4">{children}</div>}
    </div>
  );
}
