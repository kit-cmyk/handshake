import Link from "next/link";
import {
  Users,
  Building2,
  Handshake,
  Send,
  ArrowUpRight,
  Search,
  ListFilter,
  UploadCloud,
  BarChart3,
  Plus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

async function count(
  table: string,
  orgId: string,
  extra?: Record<string, string>
): Promise<number> {
  const supabase = await createClient();
  const query = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .match(extra ?? {});
  const { count } = await query;
  return count ?? 0;
}

const STATS = [
  {
    key: "contacts",
    label: "Contacts",
    hint: "People in your pipeline",
    href: "/contacts",
    icon: Users,
    ring: "ring-sky-500/20",
    chip: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    glow: "from-sky-500/20",
  },
  {
    key: "companies",
    label: "Companies",
    hint: "Accounts you're targeting",
    href: "/companies",
    icon: Building2,
    ring: "ring-violet-500/20",
    chip: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    glow: "from-violet-500/20",
  },
  {
    key: "deals",
    label: "Open Deals",
    hint: "Opportunities in motion",
    href: "/pipeline",
    icon: Handshake,
    ring: "ring-emerald-500/20",
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    glow: "from-emerald-500/20",
  },
  {
    key: "campaigns",
    label: "Campaigns",
    hint: "Outreach sequences",
    href: "/campaigns",
    icon: Send,
    ring: "ring-amber-500/20",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    glow: "from-amber-500/20",
  },
] as const;

const QUICK_ACTIONS = [
  {
    label: "Add a contact",
    desc: "Drop a new person into the pipeline",
    href: "/contacts",
    icon: Plus,
    chip: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  },
  {
    label: "Find leads",
    desc: "Scrape local businesses into your CRM",
    href: "/prospect",
    icon: Search,
    chip: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
  {
    label: "Launch a campaign",
    desc: "Build a multi-step outreach sequence",
    href: "/campaigns",
    icon: Send,
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  {
    label: "Build a segment",
    desc: "Group contacts to target your outreach",
    href: "/segments",
    icon: ListFilter,
    chip: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  },
  {
    label: "Import a CSV",
    desc: "Bring an existing list on board",
    href: "/import",
    icon: UploadCloud,
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  {
    label: "See reports",
    desc: "Track opens, clicks, and replies",
    href: "/reports",
    icon: BarChart3,
    chip: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  },
] as const;

export default async function DashboardPage() {
  const org = await getActiveOrg();
  const orgId = org!.id;

  const [contacts, companies, deals, campaigns] = await Promise.all([
    count("contacts", orgId),
    count("companies", orgId),
    // "Open Deals" card — exclude won/lost so the headline metric matches label.
    count("deals", orgId, { status: "open" }),
    count("campaigns", orgId),
  ]);

  const values: Record<string, number> = {
    contacts,
    companies,
    deals,
    campaigns,
  };

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary to-primary/70 p-6 text-primary-foreground shadow-lg shadow-primary/20 sm:p-8">
        <div className="animate-hs-float pointer-events-none absolute -right-8 -top-10 size-40 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-12 right-24 size-32 rounded-full bg-white/5 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <span className="animate-hs-wave grid size-11 shrink-0 place-items-center rounded-xl bg-white/15 backdrop-blur">
            <Handshake className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-primary-foreground">
              Welcome back to {org!.name}
            </h1>
            <p className="text-sm text-primary-foreground/80">
              Here&apos;s your pipeline at a glance. Let&apos;s close some deals.
            </p>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((s) => (
          <Link key={s.key} href={s.href} className="group">
            <Card
              className={cn(
                "relative h-full overflow-hidden ring-1 ring-inset transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md",
                s.ring,
              )}
            >
              <div
                className={cn(
                  "pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-gradient-to-br to-transparent opacity-70 blur-xl transition-opacity group-hover:opacity-100",
                  s.glow,
                )}
              />
              <div className="relative flex flex-col gap-4 p-5">
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "grid size-10 place-items-center rounded-xl",
                      s.chip,
                    )}
                  >
                    <s.icon className="size-5" />
                  </span>
                  <ArrowUpRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight tabular-nums">
                    {values[s.key]}
                  </p>
                  <p className="text-sm font-medium">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.hint}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Quick actions</h2>
          <p className="text-sm text-muted-foreground">
            Jump straight into the good stuff.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {QUICK_ACTIONS.map((a) => (
            <Link key={a.href + a.label} href={a.href} className="group">
              <Card className="flex h-full items-center gap-4 p-4 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-md">
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-xl transition-transform group-hover:scale-105",
                    a.chip,
                  )}
                >
                  <a.icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-tight">{a.label}</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {a.desc}
                  </p>
                </div>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary lg:hidden" />
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
