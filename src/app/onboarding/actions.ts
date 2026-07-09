"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type OnboardingState = { error?: string };

export async function createOrg(
  _prev: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const name = String(formData.get("name") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!name) return { error: "Workspace name is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Capture the user's name if they haven't set one yet.
  if (fullName) {
    await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
    await supabase.auth.updateUser({ data: { full_name: fullName } });
  }

  // Seeds org + owner membership + default pipeline/stages in one transaction.
  const { error } = await supabase.rpc("create_org_with_owner", {
    org_name: name,
  });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
