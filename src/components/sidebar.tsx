"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Handshake, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { OrgSwitcher } from "@/components/org-switcher";
import { DESTINATIONS, NAV_FOOTER_GROUP, NAV_GROUPS } from "@/lib/nav";
import type { NavGroup, NavKey } from "@/lib/nav";
import {
  isSidebarCollapsed,
  isSidebarCollapsedOnServer,
  subscribeSidebarState,
  writeSidebarState,
} from "@/lib/sidebar-state";
import type { Org } from "@/lib/org";

/**
 * The sidebar collapses to an icon-only rail. Its width and which pieces are
 * visible are driven entirely by the `sidebar-collapsed:` CSS variant, so the
 * rail is already painted on first load — the `collapsed` value below only
 * feeds the parts CSS can't do (ARIA and hover tooltips), and comes from the
 * document itself so hydration still agrees with the server's markup.
 */
export function Sidebar({
  orgs,
  activeId,
}: {
  orgs: Org[];
  activeId: string;
}) {
  const pathname = usePathname();
  const collapsed = React.useSyncExternalStore(
    subscribeSidebarState,
    isSidebarCollapsed,
    isSidebarCollapsedOnServer
  );

  const toggle = React.useCallback(() => {
    writeSidebarState(isSidebarCollapsed() ? "expanded" : "collapsed");
  }, []);

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r bg-card transition-[width] duration-200 ease-out motion-reduce:transition-none sidebar-collapsed:w-16">
      <Link
        href="/dashboard"
        title={collapsed ? "Handshake" : undefined}
        className="flex h-14 items-center gap-2.5 border-b px-5 sidebar-collapsed:justify-center sidebar-collapsed:px-0"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Handshake className="size-5" />
        </span>
        <span className="font-heading text-xl font-bold tracking-tight sidebar-collapsed:hidden">
          Handshake
        </span>
      </Link>
      <nav className="flex-1 overflow-y-auto p-2">
        {NAV_GROUPS.map((group, gi) => (
          <Group
            key={group.label ?? `group-${gi}`}
            group={group}
            pathname={pathname}
            collapsed={collapsed}
            className={gi > 0 ? "mt-4" : undefined}
          />
        ))}
      </nav>
      <div className="space-y-1 border-t p-2">
        <Group
          group={NAV_FOOTER_GROUP}
          pathname={pathname}
          collapsed={collapsed}
        />
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            itemClass,
            "w-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <PanelLeftClose className="size-4 shrink-0 sidebar-collapsed:hidden" />
          <PanelLeftOpen className="hidden size-4 shrink-0 sidebar-collapsed:block" />
          <span className="sidebar-collapsed:hidden">Collapse</span>
        </button>
      </div>
      <div className="border-t p-2">
        <div className="rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm shadow-primary/20">
          <OrgSwitcher orgs={orgs} activeId={activeId} />
        </div>
      </div>
    </aside>
  );
}

/** Shared shape for every clickable row in the sidebar, rail included. */
const itemClass =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors sidebar-collapsed:justify-center sidebar-collapsed:px-0";

/** One sidebar section: an optional heading and the links under it. */
function Group({
  group,
  pathname,
  collapsed,
  className,
}: {
  group: NavGroup;
  pathname: string;
  collapsed: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      {group.label && (
        <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 sidebar-collapsed:hidden">
          {group.label}
        </p>
      )}
      {group.items.map((key) => (
        <NavLink
          key={key}
          navKey={key}
          pathname={pathname}
          collapsed={collapsed}
        />
      ))}
    </div>
  );
}

function NavLink({
  navKey,
  pathname,
  collapsed,
}: {
  navKey: NavKey;
  pathname: string;
  collapsed: boolean;
}) {
  const { href, label, icon: Icon } = DESTINATIONS[navKey];
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      // On the rail the label is hidden, so it has to carry the name itself.
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        itemClass,
        active
          ? "bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="sidebar-collapsed:hidden">{label}</span>
    </Link>
  );
}
