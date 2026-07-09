"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";
import { LIFECYCLE_STAGES, type LifecycleStage } from "@/lib/types";

export type PipelineState = { ok?: boolean; error?: string; message?: string };

const CAN_MANAGE = ["owner", "admin"];

/**
 * Persist the stage → lifecycle mapping edited in Settings → Pipeline. Each
 * stage's Select posts as `stage:<id>`; an empty value clears the mapping. Only
 * stages belonging to the caller's org are touched (RLS enforces this too).
 */
export async function updateStageLifecycle(
  _prev: PipelineState,
  fd: FormData,
): Promise<PipelineState> {
  const { supabase, org } = await requireContext();

  if (!CAN_MANAGE.includes(org.role))
    return { error: "Only workspace admins can change these settings." };

  const updates: { id: string; lifecycle_stage: LifecycleStage | null }[] = [];
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("stage:")) continue;
    const v = String(value);
    updates.push({
      id: key.slice("stage:".length),
      lifecycle_stage: LIFECYCLE_STAGES.includes(v as LifecycleStage)
        ? (v as LifecycleStage)
        : null,
    });
  }
  if (!updates.length) return { ok: true, message: "Nothing to update." };

  for (const u of updates) {
    const { error } = await supabase
      .from("stages")
      .update({ lifecycle_stage: u.lifecycle_stage })
      .eq("id", u.id)
      .eq("org_id", org.id);
    if (error) return { error: error.message };
  }

  revalidatePath("/settings/pipeline");
  // The pipeline board and contact lists both depend on this mapping's effects.
  revalidatePath("/pipeline");
  return { ok: true, message: "Pipeline mapping saved." };
}
