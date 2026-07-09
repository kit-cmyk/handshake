"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setActiveOrg } from "@/lib/org-actions";
import type { Org } from "@/lib/org";

export function OrgSwitcher({
  orgs,
  activeId,
}: {
  orgs: Org[];
  activeId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const active = orgs.find((o) => o.id === activeId);
  const name = active?.name ?? "Workspace";

  const face = (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-white/20 text-sm font-bold">
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-[10px] font-medium uppercase tracking-wide text-primary-foreground/70">
          Workspace
        </span>
        <span className="block truncate text-sm font-semibold">{name}</span>
      </span>
    </span>
  );

  if (orgs.length <= 1) {
    return <div className="flex w-full items-center px-2.5 py-2">{face}</div>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          aria-label="Switch workspace"
          className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-60"
        >
          {face}
          <ChevronsUpDown className="size-4 shrink-0 text-primary-foreground/70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {orgs.map((o) => (
          <DropdownMenuItem
            key={o.id}
            onSelect={() =>
              start(async () => {
                if (o.id !== activeId) {
                  await setActiveOrg(o.id);
                  router.refresh();
                }
              })
            }
          >
            <span className="flex-1 truncate">{o.name}</span>
            {o.id === activeId && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
