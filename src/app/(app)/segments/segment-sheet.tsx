"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SegmentBuilder } from "./segment-builder";
import type { Segment } from "@/lib/segments";

export function SegmentSheet({
  segment,
  memberCount,
  trigger,
}: {
  segment?: Segment;
  /** Static member count, so the builder can warn before replacing a fixed list. */
  memberCount?: number;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{segment ? "Edit segment" : "New segment"}</SheetTitle>
        </SheetHeader>
        <SegmentBuilder
          // Remount on close so a cancelled edit doesn't reopen half-changed.
          key={open ? "open" : "closed"}
          segment={segment}
          memberCount={memberCount}
          onSaved={(id) => {
            setOpen(false);
            // Editing in place refreshes the current route; creating (or
            // editing from the list) lands on the segment we just saved.
            if (segment) router.refresh();
            else router.push(`/segments/${id}`);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
