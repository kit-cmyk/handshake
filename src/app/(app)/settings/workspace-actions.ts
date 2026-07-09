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

  const { error } = await supabase
    .from("organizations")
    .update({ name })
    .eq("id", org.id);
  if (error) return { error: error.message };

  // Sidebar, org switcher, and header all read the org name.
  revalidatePath("/", "layout");
  return { ok: true, message: "Workspace updated." };
}
