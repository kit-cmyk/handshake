"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { CalendarClock, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bookAppointment, type BookState } from "./actions";

const DURATIONS = [
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "1 hour" },
  { value: "90", label: "1.5 hours" },
];

export function AppointmentForm({
  dealId,
  contactId,
  contactEmail,
  onBooked,
}: {
  dealId: string;
  contactId: string | null;
  contactEmail: string | null;
  /** Called after a successful booking (in addition to the router refresh). */
  onBooked?: () => void;
}) {
  const router = useRouter();
  const [duration, setDuration] = React.useState("30");
  const action = bookAppointment.bind(null, dealId, contactId, contactEmail);
  const [state, formAction, pending] = useActionState<BookState, FormData>(
    action,
    {}
  );

  React.useEffect(() => {
    if (state.ok) {
      router.refresh();
      onBooked?.();
    }
  }, [state, router, onBooked]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="duration" value={duration} />
      <div className="space-y-2">
        <Label htmlFor="appt_title">Title</Label>
        <Input
          id="appt_title"
          name="title"
          placeholder="e.g. Discovery call"
          defaultValue=""
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="appt_start">When</Label>
          <DateTimePicker id="appt_start" name="start" />
        </div>
        <div className="space-y-2">
          <Label>Duration</Label>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="appt_notes">Notes</Label>
        <Textarea id="appt_notes" name="notes" rows={2} placeholder="Agenda…" />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && (
        <p className="flex items-center gap-1 text-sm text-green-600">
          <Check className="size-4" />
          {state.synced
            ? "Booked and added to Google Calendar."
            : "Appointment booked. Connect Google Calendar to sync it."}
        </p>
      )}

      <Button type="submit" size="sm" disabled={pending}>
        <CalendarClock className="size-4" />
        {pending ? "Booking…" : "Book appointment"}
      </Button>
    </form>
  );
}
