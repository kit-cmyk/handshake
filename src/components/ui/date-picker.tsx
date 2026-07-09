"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Value string formats match the native inputs these replace, so they drop into
// existing forms unchanged:
//   DatePicker      → "yyyy-MM-dd"        (like <input type="date">)
//   DateTimePicker  → "yyyy-MM-dd'T'HH:mm" (like <input type="datetime-local">)

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtDateTime(d: Date): string {
  return `${fmtDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function parseValue(v: string): Date | undefined {
  if (!v) return undefined;
  const [datePart, timePart] = v.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  let hh = 0;
  let mm = 0;
  if (timePart) {
    const [h, min] = timePart.split(":").map(Number);
    hh = Number.isFinite(h) ? h : 0;
    mm = Number.isFinite(min) ? min : 0;
  }
  return new Date(y, m - 1, d, hh, mm);
}

type BaseProps = {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** react-day-picker matcher for dates that can't be chosen. */
  disabledDates?: React.ComponentProps<typeof Calendar>["disabled"];
};

/** Shared controlled/uncontrolled value plumbing + hidden form input. */
function useDateValue({
  value,
  defaultValue,
  onChange,
}: Pick<BaseProps, "value" | "defaultValue" | "onChange">) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = React.useState(defaultValue ?? "");
  const current = isControlled ? value : internal;
  const commit = React.useCallback(
    (next: string) => {
      if (!isControlled) setInternal(next);
      onChange?.(next);
    },
    [isControlled, onChange]
  );
  return { current, commit };
}

export function DatePicker({
  value,
  defaultValue,
  onChange,
  name,
  id,
  disabled,
  placeholder = "Pick a date",
  className,
  disabledDates,
}: BaseProps) {
  const { current, commit } = useDateValue({ value, defaultValue, onChange });
  const [open, setOpen] = React.useState(false);
  const selected = parseValue(current);

  return (
    <>
      {name && <input type="hidden" name={name} value={current} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            id={id}
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal",
              !selected && "text-muted-foreground",
              className
            )}
          >
            <CalendarIcon className="size-4" />
            {selected ? format(selected, "PPP") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            disabled={disabledDates}
            onSelect={(d) => {
              commit(d ? fmtDate(d) : "");
              if (d) setOpen(false);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </>
  );
}

export function DateTimePicker({
  value,
  defaultValue,
  onChange,
  name,
  id,
  disabled,
  placeholder = "Pick a date & time",
  className,
  disabledDates,
}: BaseProps) {
  const { current, commit } = useDateValue({ value, defaultValue, onChange });
  const [open, setOpen] = React.useState(false);
  const selected = parseValue(current);
  const timeValue = current.includes("T") ? current.split("T")[1] : "";

  function handleDay(d: Date | undefined) {
    if (!d) {
      commit("");
      return;
    }
    // Preserve the chosen time; default to 09:00 when none set yet.
    const [h, m] = (timeValue || "09:00").split(":").map(Number);
    d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
    commit(fmtDateTime(d));
  }

  function handleTime(t: string) {
    const base = selected ?? new Date();
    const [h, m] = t.split(":").map(Number);
    base.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
    commit(fmtDateTime(base));
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={current} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            id={id}
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal",
              !selected && "text-muted-foreground",
              className
            )}
          >
            <CalendarIcon className="size-4" />
            {selected ? format(selected, "PPP p") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            disabled={disabledDates}
            onSelect={handleDay}
            initialFocus
          />
          <div className="flex items-center gap-2 border-t p-3">
            <label htmlFor={`${id ?? name ?? "dt"}-time`} className="text-sm text-muted-foreground">
              Time
            </label>
            <input
              id={`${id ?? name ?? "dt"}-time`}
              type="time"
              value={timeValue}
              onChange={(e) => handleTime(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
