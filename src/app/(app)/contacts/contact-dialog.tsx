"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ContactForm } from "./contact-form";
import { type Contact } from "@/lib/types";

type CompanyOption = { id: string; name: string };

export function ContactDialog({
  companies,
  contact,
  leadSources = [],
  trigger,
  onSaved,
}: {
  companies: CompanyOption[];
  contact?: Contact;
  /** Existing lead sources across the org, for the searchable combobox. */
  leadSources?: string[];
  trigger: React.ReactNode;
  /** Called after a successful save (in addition to the router refresh). */
  onSaved?: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{contact ? "Edit contact" : "New contact"}</SheetTitle>
        </SheetHeader>
        <ContactForm
          contact={contact}
          companies={companies}
          leadSources={leadSources}
          onSuccess={() => {
            setOpen(false);
            onSaved?.();
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
