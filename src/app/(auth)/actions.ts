"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type AuthState = {
  error?: string;
  message?: string;
  needsConfirmation?: boolean;
  email?: string;
};

/**
 * Public base URL for auth redirects (OAuth callback, confirmation emails).
 * Prefers the configured NEXT_PUBLIC_SITE_URL; if unset, derives it from the
 * incoming request's forwarded host/proto so production never falls back to
 * localhost. Only defaults to localhost when there is no request context.
 */
async function siteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

/** Turn raw Supabase auth errors into friendly, non-enumerating copy. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "Incorrect email or password.";
  if (m.includes("email not confirmed"))
    return "Please confirm your email first — check your inbox, or resend below.";
  if (m.includes("user already registered"))
    return "An account with this email already exists. Try signing in.";
  if (m.includes("password should be"))
    return "Password must be at least 6 characters.";
  return message;
}

function safeNext(next: FormDataEntryValue | null): string {
  const s = typeof next === "string" ? next : "";
  // Only allow internal, non-auth paths to prevent open redirects.
  if (s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/login") && !s.startsWith("/signup"))
    return s;
  return "";
}

export async function login(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.toLowerCase().includes("email not confirmed")) {
      redirect(`/verify-email?email=${encodeURIComponent(email)}`);
    }
    return { error: friendly(error.message), email };
  }

  revalidatePath("/", "layout");
  redirect(next || "/dashboard");
}

export async function signup(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const next = safeNext(formData.get("next"));

  if (password.length < 6)
    return { error: "Password must be at least 6 characters.", email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName || null },
      emailRedirectTo: `${await siteUrl()}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`,
    },
  });

  if (error) return { error: friendly(error.message), email };

  if (data.session) {
    revalidatePath("/", "layout");
    redirect(next || "/onboarding");
  }

  // Email confirmation required → dedicated verification screen.
  redirect(`/verify-email?email=${encodeURIComponent(email)}`);
}

export async function resendConfirmation(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email first." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${await siteUrl()}/auth/callback` },
  });
  if (error) return { error: friendly(error.message), email, needsConfirmation: true };
  return { message: "Confirmation email sent.", email, needsConfirmation: true };
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email." };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteUrl()}/auth/callback?next=/reset-password`,
  });
  // Never reveal whether the email exists.
  return {
    message: "If an account exists for that email, a reset link is on its way.",
  };
}

export async function updatePassword(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 6)
    return { error: "Password must be at least 6 characters." };
  if (password !== confirm) return { error: "Passwords do not match." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your reset link has expired. Request a new one." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: friendly(error.message) };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function signInWithGoogle(formData: FormData) {
  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await siteUrl()}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`,
    },
  });
  if (error) redirect("/error?message=" + encodeURIComponent(error.message));
  if (data.url) redirect(data.url);
}
