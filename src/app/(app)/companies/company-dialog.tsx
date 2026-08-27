"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CompanyForm } from "./company-form";
import type { Company } from "@/lib/types";

export function CompanyDialog({
  company,
  categories,
  trigger,
  onSaved,
}: {
  company?: Company;
  /** Options for the category combobox; defaults to the built-in list. */
  categories?: string[];
  trigger: React.ReactNode;
  onSaved?: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{company ? "Edit company" : "New company"}</SheetTitle>
        </SheetHeader>
        <CompanyForm
          company={company}
          categories={categories}
          onSuccess={() => {
            setOpen(false);
            onSaved?.();
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
