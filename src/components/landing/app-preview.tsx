import {
  LayoutDashboard,
  Users,
  Building2,
  Handshake,
  ListFilter,
  Send,
  Workflow,
  BarChart3,
  Settings,
  Search,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavKey =
  | "dashboard"
  | "contacts"
  | "companies"
  | "deals"
  | "segments"
  | "campaigns"
  | "workflows"
  | "reports"
  | "settings";

const NAV: { key: NavKey; label: string; icon: typeof Users }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "contacts", label: "Contacts", icon: Users },
  { key: "companies", label: "Companies", icon: Building2 },
  { key: "deals", label: "Deals", icon: Handshake },
  { key: "segments", label: "Segments", icon: ListFilter },
  { key: "campaigns", label: "Campaigns", icon: Send },
  { key: "workflows", label: "Workflows", icon: Workflow },
  { key: "reports", label: "Reports", icon: BarChart3 },
  { key: "settings", label: "Settings", icon: Settings },
];

/** A framed, browser-chrome preview of an authenticated app screen. */
function AppFrame({
  active,
  path,
  title,
  children,
}: {
  active: NavKey;
  path: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-2xl ring-1 ring-black/5">
      {/* browser chrome */}
      <div className="flex items-center gap-3 border-b bg-muted/50 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-rose-400/70" />
          <span className="size-2.5 rounded-full bg-amber-400/70" />
          <span className="size-2.5 rounded-full bg-emerald-400/70" />
        </div>
        <div className="mx-auto flex w-full max-w-xs items-center gap-2 rounded-md bg-background/70 px-3 py-1 text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          app.handshake.com{path}
        </div>
      </div>

      {/* app shell */}
      <div className="flex h-[360px] text-xs sm:h-[420px]">
        {/* sidebar */}
        <aside className="hidden w-44 shrink-0 flex-col border-r bg-card sm:flex">
          <div className="flex h-12 items-center gap-2 border-b px-4">
            <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
              <Handshake className="size-3.5" />
            </span>
            <span className="font-heading text-sm font-bold tracking-tight">
              Handshake
            </span>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-hidden p-2">
            {NAV.map(({ key, label, icon: Icon }) => (
              <div
                key={key}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium",
                  key === active
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </div>
            ))}
          </nav>
        </aside>

        {/* main */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
            <span className="text-sm font-semibold tracking-tight">
              {title}
            </span>
            <div className="flex items-center gap-3">
              <Search className="size-4 text-muted-foreground" />
              <span className="grid size-6 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                MR
              </span>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-hidden bg-background p-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

const bar = "rounded-full bg-foreground/10";

/* ----------------------------- Dashboard ----------------------------- */

function DashboardScreen() {
  const stats = [
    { label: "Contacts", value: "1,284", chip: "bg-sky-500/15 text-sky-600", ring: "ring-sky-500/20" },
    { label: "Companies", value: "312", chip: "bg-violet-500/15 text-violet-600", ring: "ring-violet-500/20" },
    { label: "Open Deals", value: "47", chip: "bg-emerald-500/15 text-emerald-600", ring: "ring-emerald-500/20" },
    { label: "Campaigns", value: "8", chip: "bg-amber-500/15 text-amber-600", ring: "ring-amber-500/20" },
  ];
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-primary to-primary/70 p-4 text-primary-foreground shadow-sm">
        <div className="pointer-events-none absolute -right-6 -top-8 size-24 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-white/15">
            <Handshake className="size-4" />
          </span>
          <div>
            <div className="text-sm font-bold">Welcome back to Lumen</div>
            <div className="text-[11px] text-primary-foreground/80">
              Here&rsquo;s your pipeline at a glance.
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className={cn("rounded-xl border p-3 ring-1 ring-inset", s.ring)}
          >
            <span className={cn("grid size-7 place-items-center rounded-lg", s.chip)}>
              <ArrowUpRight className="size-3.5" />
            </span>
            <div className="mt-2 text-lg font-bold tabular-nums">{s.value}</div>
            <div className="text-[10px] font-medium text-muted-foreground">
              {s.label}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {["Add a contact", "Launch a campaign", "Build a segment"].map((a) => (
          <div key={a} className="flex items-center gap-2 rounded-xl border p-2.5">
            <span className="size-6 shrink-0 rounded-lg bg-primary/15" />
            <div className="min-w-0">
              <div className="truncate text-[11px] font-medium">{a}</div>
              <div className={cn(bar, "mt-1 h-1 w-10")} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------- Deals -------------------------------- */

function DealsScreen() {
  const cols = [
    { name: "New", dot: "bg-sky-500", deals: [["Acme Co", "$12k"], ["Northwind", "$8k"]] },
    { name: "Qualified", dot: "bg-amber-500", deals: [["Lumen", "$24k"], ["Patex", "$5k"]] },
    { name: "Proposal", dot: "bg-violet-500", deals: [["Consbit", "$40k"]] },
    { name: "Won", dot: "bg-emerald-500", deals: [["Todobit", "$18k"], ["Vertex", "$9k"]] },
  ];
  return (
    <div className="grid h-full grid-cols-4 gap-2">
      {cols.map((c) => (
        <div key={c.name} className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className={cn("size-1.5 rounded-full", c.dot)} />
              {c.name}
            </span>
            <span className="text-muted-foreground/60">{c.deals.length}</span>
          </div>
          {c.deals.map(([company, amount]) => (
            <div key={company} className="rounded-lg border bg-card p-2.5 shadow-sm">
              <div className="text-[11px] font-semibold">{company}</div>
              <div className="mt-0.5 text-[10px] font-medium text-emerald-600">
                {amount}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="size-4 rounded-full bg-primary/70" />
                <div className={cn(bar, "h-1 w-6")} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Contacts ------------------------------ */

function ContactsScreen() {
  const rows = [
    ["Maya Rivera", "maya@lumen.io", "Lumen", "Qualified", "bg-amber-500/15 text-amber-600"],
    ["Dev Okoro", "dev@acme.co", "Acme Co", "Won", "bg-emerald-500/15 text-emerald-600"],
    ["Sara Lin", "sara@patex.com", "Patex", "Contacted", "bg-sky-500/15 text-sky-600"],
    ["Tom Vega", "tom@consbit.io", "Consbit", "New", "bg-muted text-muted-foreground"],
    ["Ivy Chen", "ivy@northwind.co", "Northwind", "Qualified", "bg-amber-500/15 text-amber-600"],
    ["Leo Faris", "leo@todobit.com", "Todobit", "Won", "bg-emerald-500/15 text-emerald-600"],
  ];
  return (
    <div className="flex h-full flex-col rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className={cn(bar, "h-2 w-20")} />
        <div className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] text-muted-foreground">
          <Search className="size-3" /> Search contacts…
        </div>
      </div>
      <div className="grid grid-cols-[1.4fr_1.4fr_1fr_0.8fr] gap-2 border-b px-3 py-1.5 text-[10px] font-semibold text-muted-foreground">
        <span>Name</span>
        <span>Email</span>
        <span>Company</span>
        <span>Stage</span>
      </div>
      <div className="min-h-0 flex-1 divide-y">
        {rows.map(([name, email, company, stage, chip]) => (
          <div
            key={email}
            className="grid grid-cols-[1.4fr_1.4fr_1fr_0.8fr] items-center gap-2 px-3 py-2 text-[11px]"
          >
            <span className="flex items-center gap-2">
              <span className="grid size-5 place-items-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">
                {name.split(" ").map((w) => w[0]).join("")}
              </span>
              <span className="font-medium">{name}</span>
            </span>
            <span className="truncate text-muted-foreground">{email}</span>
            <span className="truncate">{company}</span>
            <span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[9px] font-medium",
                  chip,
                )}
              >
                {stage}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ Campaigns ----------------------------- */

function CampaignsScreen() {
  const rows = [
    ["Q3 Outreach", "Active", "bg-emerald-500/15 text-emerald-600", "4,820", "63%"],
    ["Renewal nudge", "Active", "bg-emerald-500/15 text-emerald-600", "1,210", "58%"],
    ["Cold leads", "Paused", "bg-amber-500/15 text-amber-600", "930", "41%"],
    ["Winback", "Draft", "bg-muted text-muted-foreground", "—", "—"],
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Sent", "6,960"],
          ["Avg. open", "61%"],
          ["Replies", "18%"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border p-3">
            <div className="text-lg font-bold tabular-nums">{v}</div>
            <div className="text-[10px] font-medium text-muted-foreground">
              {k}
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-card">
        <div className="grid grid-cols-[1.6fr_0.8fr_0.7fr_0.7fr] gap-2 border-b px-3 py-1.5 text-[10px] font-semibold text-muted-foreground">
          <span>Campaign</span>
          <span>Status</span>
          <span>Sent</span>
          <span>Open</span>
        </div>
        <div className="divide-y">
          {rows.map(([name, status, chip, sent, open]) => (
            <div
              key={name}
              className="grid grid-cols-[1.6fr_0.8fr_0.7fr_0.7fr] items-center gap-2 px-3 py-2 text-[11px]"
            >
              <span className="flex items-center gap-2 font-medium">
                <Send className="size-3 text-muted-foreground" />
                {name}
              </span>
              <span>
                <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-medium", chip)}>
                  {status}
                </span>
              </span>
              <span className="tabular-nums text-muted-foreground">{sent}</span>
              <span className="tabular-nums text-muted-foreground">{open}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Gallery ------------------------------- */

const SCREENS = [
  {
    active: "dashboard" as NavKey,
    path: "/dashboard",
    title: "Dashboard",
    heading: "Your whole pipeline, the moment you log in",
    body: "Live counts, a warm welcome, and one-click jumps into everything that matters — no digging required.",
    screen: <DashboardScreen />,
  },
  {
    active: "deals" as NavKey,
    path: "/pipeline",
    title: "Pipeline",
    heading: "Drag deals forward on a board that keeps up",
    body: "A kanban pipeline with amounts, owners, and stages. See what is close and what is stuck at a glance.",
    screen: <DealsScreen />,
  },
  {
    active: "contacts" as NavKey,
    path: "/contacts",
    title: "Contacts",
    heading: "Every person, searchable in an instant",
    body: "A fast, sortable table with lifecycle stages, companies, and owners — built to scale to your whole book.",
    screen: <ContactsScreen />,
  },
  {
    active: "campaigns" as NavKey,
    path: "/campaigns",
    title: "Campaigns",
    heading: "Outreach with numbers you can trust",
    body: "Track sends, opens, and replies across every sequence, and know exactly which campaigns are working.",
    screen: <CampaignsScreen />,
  },
];

export function TourGallery() {
  return (
    <div className="space-y-20 sm:space-y-28">
      {SCREENS.map((s, i) => (
        <div
          key={s.path}
          className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12"
        >
          <div className={cn(i % 2 === 1 && "lg:order-2")}>
            <span className="text-sm font-semibold text-primary">
              {s.title}
            </span>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
              {s.heading}
            </h2>
            <p className="mt-3 max-w-md text-muted-foreground">{s.body}</p>
          </div>
          <div className={cn(i % 2 === 1 && "lg:order-1")}>{s.screen && (
            <AppFrame active={s.active} path={s.path} title={s.title}>
              {s.screen}
            </AppFrame>
          )}</div>
        </div>
      ))}
    </div>
  );
}
