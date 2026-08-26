"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Handshake } from "lucide-react";
import { cn } from "@/lib/utils";
import { OrgSwitcher } from "@/components/org-switcher";
import { DESTINATIONS, PRIMARY_NAV } from "@/lib/nav";
import type { Org } from "@/lib/org";

export function Sidebar({
  orgs,
  activeId,
}: {
  orgs: Org[];
  activeId: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r bg-card">
      <Link
        href="/dashboard"
        className="flex h-14 items-center gap-2.5 border-b px-5"
      >
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Handshake className="size-5" />
        </span>
        <span className="font-heading text-xl font-bold tracking-tight">
          Handshake
        </span>
      </Link>
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {PRIMARY_NAV.map((key) => {
          const { href, label, icon: Icon } = DESTINATIONS[key];
          const active =
            pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-2">
        <div className="rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm shadow-primary/20">
          <OrgSwitcher orgs={orgs} activeId={activeId} />
        </div>
      </div>
    </aside>
  );
}
