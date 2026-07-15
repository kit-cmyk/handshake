"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { StickyNote, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { addDealNote, type FormState } from "./actions";
import { AppointmentForm } from "./[id]/appointment-form";

export function DealQuickActions({
  dealId,
  contactId,
  contactEmail,
  onChange,
}: {
  dealId: string;
  contactId: string | null;
  contactEmail: string | null;
  /** Called after a note/appointment is added, so callers can refresh. */
  onChange?: () => void;
}) {
  const router = useRouter();
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [apptOpen, setApptOpen] = React.useState(false);
  const [noteState, noteAction, notePending] = useActionState<
    FormState,
    FormData
  >(addDealNote.bind(null, dealId), {});

  React.useEffect(() => {
    if (noteState.ok) {
      // Reacts to a form-submit result; the effect is required for router.refresh().
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNoteOpen(false);
      onChange?.();
      router.refresh();
    }
  }, [noteState, onChange, router]);

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <StickyNote className="size-4" /> Add note
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add note</DialogTitle>
          </DialogHeader>
          <form action={noteAction} className="space-y-3">
            <Textarea name="body" rows={4} placeholder="Log a note…" autoFocus />
            {noteState.error && (
              <p className="text-sm text-destructive">{noteState.error}</p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={notePending}>
                {notePending ? "Adding…" : "Add note"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={apptOpen} onOpenChange={setApptOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <CalendarClock className="size-4" /> Book appointment
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Book appointment</DialogTitle>
          </DialogHeader>
          <AppointmentForm
            dealId={dealId}
            contactId={contactId}
            contactEmail={contactEmail}
            onBooked={() => {
              setApptOpen(false);
              onChange?.();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
