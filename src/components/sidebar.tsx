"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  Users,
  Building2,
  Handshake,
  KanbanSquare,
  ListFilter,
  Send,
  Workflow,
  BarChart3,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OrgSwitcher } from "@/components/org-switcher";
import type { Org } from "@/lib/org";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/segments", label: "Segments", icon: ListFilter },
  { href: "/campaigns", label: "Campaigns", icon: Send },
  { href: "/workflows", label: "Workflows", icon: Workflow },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

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
        {NAV.map(({ href, label, icon: Icon }) => {
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
