"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";
import { inngest } from "@/lib/inngest/client";
import { ACTIVITY_TYPES, type ActivityType } from "@/lib/types";

export type ActivityState = { ok?: boolean; error?: string };

export async function addActivity(
  contactId: string,
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
    contact_id: contactId,
    user_id: userId,
    type,
    body,
    due_at:
      (type === "task" || type === "appointment") && dueRaw
        ? new Date(dueRaw).toISOString()
        : null,
  });

  if (error) return { error: error.message };

  // Drives activity_logged campaign triggers.
  await inngest.send({
    name: "contact/activity.logged",
    data: { orgId: org.id, contactId, activityType: type },
  });

  revalidatePath(`/contacts/${contactId}`);
  return { ok: true };
}

export async function toggleTaskDone(id: string, contactId: string, done: boolean) {
  const { supabase } = await requireContext();
  await supabase
    .from("activities")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("id", id);
  revalidatePath(`/contacts/${contactId}`);
}

export async function deleteActivity(id: string, contactId: string) {
  const { supabase } = await requireContext();
  await supabase.from("activities").delete().eq("id", id);
  revalidatePath(`/contacts/${contactId}`);
}
