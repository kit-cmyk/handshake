"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updateSendWindow, type WorkspaceState } from "./workspace-actions";

// A small, curated timezone list keeps the picker usable; the current value is
// merged in so an org configured with any IANA zone still round-trips.
const COMMON_TZ = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Madrid",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const DAYS = [
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
  { n: 0, label: "Sun" },
];

function hourLabel(h: number): string {
  if (h === 0 || h === 24) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export function SendWindowForm({
  timezone,
  startHour,
  endHour,
  days,
  canManage,
}: {
  timezone: string;
  startHour: number;
  endHour: number;
  days: number[];
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState<WorkspaceState, FormData>(
    updateSendWindow,
    {},
  );

  const tzOptions = COMMON_TZ.includes(timezone)
    ? COMMON_TZ
    : [timezone, ...COMMON_TZ];
  const daySet = new Set(days);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        <select
          id="timezone"
          name="timezone"
          defaultValue={timezone}
          disabled={!canManage}
          className="flex h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:opacity-50"
        >
          {tzOptions.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="space-y-2">
          <Label htmlFor="start_hour">Send from</Label>
          <select
            id="start_hour"
            name="start_hour"
            defaultValue={startHour}
            disabled={!canManage}
            className="flex h-9 w-32 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:opacity-50"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="end_hour">Until</Label>
          <select
            id="end_hour"
            name="end_hour"
            defaultValue={endHour}
            disabled={!canManage}
            className="flex h-9 w-32 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:opacity-50"
          >
            {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Sending days</Label>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d) => (
            <label
              key={d.n}
              className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"
            >
              <input
                type="checkbox"
                name="days"
                value={d.n}
                defaultChecked={daySet.has(d.n)}
                disabled={!canManage}
                className="size-3.5 accent-primary"
              />
              {d.label}
            </label>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Campaign and workflow emails only send inside this window. Sends that
        fall outside it wait for the next open slot.
      </p>

      <div aria-live="polite">
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        {state.message && (
          <p className="text-sm text-green-600">{state.message}</p>
        )}
      </div>

      {canManage ? (
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save schedule"}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Only workspace admins can change the sending schedule.
        </p>
      )}
    </form>
  );
}
