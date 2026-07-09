"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AccountState = { ok?: boolean; error?: string; message?: string };

export async function updateProfile(
  _prev: AccountState,
  fd: FormData
): Promise<AccountState> {
  const fullName = String(fd.get("full_name") ?? "").trim();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName || null })
    .eq("id", user.id);
  if (error) return { error: error.message };

  // Keep auth metadata in sync so it survives re-provisioning.
  await supabase.auth.updateUser({ data: { full_name: fullName || null } });

  revalidatePath("/settings/profile");
  return { ok: true, message: "Profile updated." };
}

const AVATAR_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function updateAvatar(
  _prev: AccountState,
  fd: FormData
): Promise<AccountState> {
  const file = fd.get("avatar");
  if (!(file instanceof File) || file.size === 0)
    return { error: "Choose an image to upload." };
  if (file.size > 2 * 1024 * 1024)
    return { error: "Image must be 2 MB or smaller." };
  const ext = AVATAR_EXT[file.type];
  if (!ext) return { error: "Use a PNG, JPG, WEBP, or GIF image." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const path = `${user.id}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) return { error: uploadError.message };

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/settings/profile");
  revalidatePath("/", "layout");
  return { ok: true, message: "Photo updated." };
}

export async function removeAvatar(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);

  revalidatePath("/settings/profile");
  revalidatePath("/", "layout");
}

export async function updateEmail(
  _prev: AccountState,
  fd: FormData
): Promise<AccountState> {
  const email = String(fd.get("email") ?? "").trim();
  if (!email) return { error: "Enter an email." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email });
  if (error) return { error: error.message };
  return {
    ok: true,
    message: "Check both your old and new inbox to confirm the change.",
  };
}

export async function updatePasswordSettings(
  _prev: AccountState,
  fd: FormData
): Promise<AccountState> {
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (password.length < 6)
    return { error: "Password must be at least 6 characters." };
  if (password !== confirm) return { error: "Passwords do not match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { ok: true, message: "Password updated." };
}
