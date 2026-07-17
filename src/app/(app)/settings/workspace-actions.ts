"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";

export type WorkspaceState = { ok?: boolean; error?: string; message?: string };

const CAN_MANAGE = ["owner", "admin"];

export async function updateWorkspace(
  _prev: WorkspaceState,
  fd: FormData,
): Promise<WorkspaceState> {
  const { supabase, org } = await requireContext();

  if (!CAN_MANAGE.includes(org.role))
    return { error: "Only workspace admins can change these settings." };

  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { error: "Workspace name is required." };
  if (name.length > 80)
    return { error: "Workspace name must be 80 characters or fewer." };

  const bookingRaw = String(fd.get("booking_url") ?? "").trim();
  if (bookingRaw && !isValidHttpUrl(bookingRaw))
    return { error: "Booking link must be a full URL starting with https://." };
  // Empty clears the link; templates then render the {{booking_link}} token empty.
  const booking_url = bookingRaw || null;

  const { error } = await supabase
    .from("organizations")
    .update({ name, booking_url })
    .eq("id", org.id);
  if (error) return { error: error.message };

  // Sidebar, org switcher, and header all read the org name.
  revalidatePath("/", "layout");
  return { ok: true, message: "Workspace updated." };
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function updateSendWindow(
  _prev: WorkspaceState,
  fd: FormData,
): Promise<WorkspaceState> {
  const { supabase, org } = await requireContext();

  if (!CAN_MANAGE.includes(org.role))
    return { error: "Only workspace admins can change these settings." };

  const timezone = String(fd.get("timezone") ?? "UTC").trim();
  if (!isValidTimezone(timezone))
    return { error: "Pick a valid timezone." };

  const start = Number(fd.get("start_hour"));
  const end = Number(fd.get("end_hour"));
  if (!Number.isInteger(start) || start < 0 || start > 23)
    return { error: "Start hour must be between 0 and 23." };
  if (!Number.isInteger(end) || end < 1 || end > 24)
    return { error: "End hour must be between 1 and 24." };
  if (start >= end)
    return { error: "The start hour must be before the end hour." };

  // Checkbox group named "days": weekday numbers 0 (Sun) – 6 (Sat).
  const days = fd
    .getAll("days")
    .map((d) => Number(d))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  if (!days.length)
    return { error: "Pick at least one sending day." };

  const { error } = await supabase
    .from("organizations")
    .update({
      send_timezone: timezone,
      send_window_start: start,
      send_window_end: end,
      send_days: [...new Set(days)].sort((a, b) => a - b),
    })
    .eq("id", org.id);
  if (error) return { error: error.message };

  return { ok: true, message: "Sending schedule updated." };
}
