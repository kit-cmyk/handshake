"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type InboxTab = "contacts" | "companies";
export type InboxFilter = "all" | "unread" | "mine" | "closed";

const FILTERS: { value: InboxFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "mine", label: "Assigned to me" },
  { value: "closed", label: "Closed" },
];

export function InboxFilters({
  tab,
  filter,
  q,
}: {
  tab: InboxTab;
  filter: InboxFilter;
  q: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();

  // Preserve the other params (except the selected conversation, which is
  // conversation-specific) when switching tab/filter.
  const hrefWith = React.useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      next.delete("c");
      const qs = next.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [params, pathname]
  );

  const [term, setTerm] = React.useState(q);
  React.useEffect(() => setTerm(q), [q]);

  // Debounce search into the URL.
  React.useEffect(() => {
    const id = setTimeout(() => {
      if (term === q) return;
      router.replace(hrefWith({ q: term }));
    }, 300);
    return () => clearTimeout(id);
  }, [term, q, router, hrefWith]);

  return (
    <div className="space-y-2 border-b p-2">
      <div className="grid grid-cols-2 gap-1">
        {(["contacts", "companies"] as InboxTab[]).map((t) => (
          <Link
            key={t}
            href={hrefWith({ tab: t })}
            className={cn(
              "rounded-md px-3 py-1.5 text-center text-sm font-medium capitalize transition-colors",
              tab === t
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {t}
          </Link>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search conversations…"
          className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={hrefWith({ filter: f.value })}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              filter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
