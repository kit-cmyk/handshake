"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addActivity, type ActivityState } from "./actions";
import { ACTIVITY_TYPES, type ActivityType } from "@/lib/types";

const LABELS: Record<ActivityType, string> = {
  note: "Note",
  call: "Call",
  task: "Task",
  email: "Email",
  appointment: "Appointment",
};

export function ActivityComposer({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<ActivityType>("note");
  const action = addActivity.bind(null, contactId);
  const [state, formAction, pending] = useActionState<ActivityState, FormData>(
    action,
    {}
  );

  React.useEffect(() => {
    if (state.ok) {
      // Reacts to a form-submit result; the effect is required for router.refresh().
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
      setType("note");
      router.refresh();
    }
  }, [state, router]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Add activity
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Log activity</SheetTitle>
        </SheetHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="type" value={type} />
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ActivityType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(type === "task" || type === "appointment") && (
            <div className="space-y-2">
              <Label htmlFor="due_at">
                {type === "appointment" ? "When" : "Due"}
              </Label>
              <DateTimePicker id="due_at" name="due_at" />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="body">Details</Label>
            <Textarea
              id="body"
              name="body"
              placeholder={
                type === "task" ? "What needs doing?" : "Log a note, call, or email…"
              }
              rows={5}
            />
          </div>

          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <SheetFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add activity"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
