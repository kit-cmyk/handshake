"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Send, Workflow as WorkflowIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/reports/campaigns", label: "Campaigns", icon: Send },
  { href: "/reports/workflows", label: "Workflows", icon: WorkflowIcon },
];

export function ReportsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
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
