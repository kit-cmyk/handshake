"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Building2, Users, Mail, Blocks, KanbanSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/settings/profile", label: "Profile", icon: User },
  { href: "/settings/workspace", label: "Workspace", icon: Building2 },
  { href: "/settings/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/settings/team", label: "Team", icon: Users },
  { href: "/settings/mailboxes", label: "Mailboxes", icon: Mail },
  { href: "/settings/integrations", label: "Integrations", icon: Blocks },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
