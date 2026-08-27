import { createBrowserClient } from "@supabase/ssr";

/** Supabase client for use in Client Components (browser). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // Supabase renamed the public key: new projects issue `sb_publishable_...`,
    // older ones a JWT `anon` key. Either works here — accept both.
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!
  );
}
