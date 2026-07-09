"use client";

import * as React from "react";
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
  trigger,
}: {
  segment?: Segment;
  trigger: React.ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{segment ? "Edit segment" : "New segment"}</SheetTitle>
        </SheetHeader>
        <SegmentBuilder segment={segment} />
      </SheetContent>
    </Sheet>
  );
}
