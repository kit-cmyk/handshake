"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";
import { getCalendarProvider } from "@/lib/calendar/provider";
import { ACTIVITY_TYPES, type ActivityType } from "@/lib/types";

export type ActivityState = { ok?: boolean; error?: string };

/** Log a note/call/email/task against a deal (and its linked contact). */
export async function addDealActivity(
  dealId: string,
  contactId: string | null,
  _prev: ActivityState,
  fd: FormData
): Promise<ActivityState> {
  const { supabase, org, userId } = await requireContext();

  const typeRaw = String(fd.get("type") ?? "note");
  const type = (
    ACTIVITY_TYPES.includes(typeRaw as ActivityType) ? typeRaw : "note"
  ) as ActivityType;
  const body = String(fd.get("body") ?? "").trim();
  const dueRaw = String(fd.get("due_at") ?? "").trim();

  if (!body) return { error: "Write something first." };

  const { error } = await supabase.from("activities").insert({
    org_id: org.id,
    deal_id: dealId,
    contact_id: contactId,
    user_id: userId,
    type,
    body,
    due_at: type === "task" && dueRaw ? new Date(dueRaw).toISOString() : null,
  });
  if (error) return { error: error.message };

  revalidatePath(`/pipeline/${dealId}`);
  return { ok: true };
}

export type BookState = {
  ok?: boolean;
  error?: string;
  /** Whether it also synced to Google Calendar. */
  synced?: boolean;
};

/** Book an appointment on a deal: records it in-app and, when a calendar is
 *  connected, creates the real event. */
export async function bookAppointment(
  dealId: string,
  contactId: string | null,
  contactEmail: string | null,
  _prev: BookState,
  fd: FormData
): Promise<BookState> {
  const { supabase, org, userId } = await requireContext();

  const title = String(fd.get("title") ?? "").trim() || "Appointment";
  const notes = String(fd.get("notes") ?? "").trim();
  const startRaw = String(fd.get("start") ?? "").trim();
  const durationMin = Math.min(
    Math.max(Number(fd.get("duration")) || 30, 15),
    480
  );
  if (!startRaw) return { error: "Pick a date and time." };

  const start = new Date(startRaw);
  if (Number.isNaN(start.getTime())) return { error: "Invalid date/time." };
  const end = new Date(start.getTime() + durationMin * 60_000);

  // Best-effort real calendar event (no-op until OAuth is connected).
  const calendar = getCalendarProvider();
  const event = await calendar.createEvent({
    summary: title,
    description: notes || null,
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    attendees: contactEmail ? [contactEmail] : undefined,
  });

  const bodyLines = [title, notes].filter(Boolean).join("\n");
  const { error } = await supabase.from("activities").insert({
    org_id: org.id,
    deal_id: dealId,
    contact_id: contactId,
    user_id: userId,
    type: "appointment",
    body: bodyLines,
    due_at: start.toISOString(),
  });
  if (error) return { error: error.message };

  // Surface the upcoming appointment on the contact record too.
  if (contactId) {
    await supabase
      .from("contacts")
      .update({ appointment_date: start.toISOString().slice(0, 10) })
      .eq("id", contactId);
    revalidatePath(`/contacts/${contactId}`);
  }

  revalidatePath(`/pipeline/${dealId}`);
  return { ok: true, synced: !!event };
}

export async function toggleTaskDone(
  id: string,
  dealId: string,
  done: boolean
) {
  const { supabase } = await requireContext();
  await supabase
    .from("activities")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("id", id);
  revalidatePath(`/pipeline/${dealId}`);
}

export async function deleteDealActivity(id: string, dealId: string) {
  const { supabase } = await requireContext();
  await supabase.from("activities").delete().eq("id", id);
  revalidatePath(`/pipeline/${dealId}`);
}
