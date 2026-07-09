import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg, listOrgs } from "@/lib/org";
import { Sidebar } from "@/components/sidebar";
import { HeaderSearch } from "@/components/header-search";
import { UserMenu } from "@/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { resolveAvatar } from "@/lib/avatar";
import { signout } from "../(auth)/actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [org, orgs, { data: profile }] = await Promise.all([
    getActiveOrg(),
    listOrgs(),
    // select("*") stays resilient if the avatar_url migration hasn't run yet.
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
  ]);
  if (!org) redirect("/onboarding");

  const email = user.email ?? "";
  const name =
    (profile?.full_name as string | null)?.trim() || email || "Your account";
  const avatarSrc = resolveAvatar(
    user.id,
    profile?.avatar_url as string | null | undefined
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar orgs={orgs} activeId={org.id} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-end gap-3 border-b bg-card px-6">
          <Suspense fallback={<div className="h-9 w-56 lg:w-72" />}>
            <HeaderSearch />
          </Suspense>
          <ThemeToggle />
          <UserMenu
            name={name}
            email={email}
            avatarSrc={avatarSrc}
            signOutAction={signout}
          />
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
