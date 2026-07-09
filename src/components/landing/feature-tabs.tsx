"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type TabKey = "pipeline" | "campaigns" | "workflows" | "reports";

const TABS: { key: TabKey; label: string }[] = [
  { key: "pipeline", label: "Deal Pipeline" },
  { key: "campaigns", label: "Campaigns" },
  { key: "workflows", label: "Workflows" },
  { key: "reports", label: "Reports" },
];

const COPY: Record<TabKey, { title: string; body: string }> = {
  pipeline: {
    title: "A pipeline that moves itself forward",
    body: "Drag deals across stages, see what is stuck, and let reminders nudge the next step. Every contact and conversation lives one click away.",
  },
  campaigns: {
    title: "Campaigns that actually get replies",
    body: "Build sequences, personalize at scale, and track opens and clicks in real time — without leaving your CRM.",
  },
  workflows: {
    title: "Automate the busywork",
    body: "Route leads, assign owners, and trigger follow-ups with a visual builder your whole team can read.",
  },
  reports: {
    title: "Know your numbers at a glance",
    body: "Forecast revenue, spot slipping deals, and measure what each rep and channel is really worth.",
  },
};

export function FeatureTabs() {
  const [active, setActive] = React.useState<TabKey>("pipeline");

  return (
    <div>
      <div className="flex flex-wrap justify-center gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm transition-all",
              active === tab.key
                ? "border-primary bg-primary font-semibold text-primary-foreground shadow-md shadow-primary/30"
                : "border-border bg-card font-medium text-muted-foreground hover:border-foreground/25 hover:text-foreground",
            )}
            aria-pressed={active === tab.key}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-8 grid items-center gap-8 rounded-3xl border bg-card p-4 shadow-lg sm:p-6 lg:grid-cols-2 lg:gap-4">
        <div className="order-2 px-3 pb-4 lg:order-1 lg:px-6 lg:py-8">
          <h3 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            {COPY[active].title}
          </h3>
          <p className="mt-4 max-w-md text-muted-foreground">
            {COPY[active].body}
          </p>
          <a
            href="/tour"
            className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            Take a tour →
          </a>
        </div>
        <div className="order-1 lg:order-2">
          <Mockup tab={active} />
        </div>
      </div>
    </div>
  );
}

function Mockup({ tab }: { tab: TabKey }) {
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border bg-muted p-4">
      {tab === "pipeline" && <PipelineMock />}
      {tab === "campaigns" && <CampaignsMock />}
      {tab === "workflows" && <WorkflowsMock />}
      {tab === "reports" && <ReportsMock />}
    </div>
  );
}

const bar = "rounded-full bg-foreground/10";

function PipelineMock() {
  const cols = [
    { name: "New", n: 3, tone: "bg-primary" },
    { name: "Qualified", n: 2, tone: "bg-amber-500" },
    { name: "Won", n: 2, tone: "bg-emerald-500" },
  ];
  return (
    <div className="grid h-full grid-cols-3 gap-3">
      {cols.map((c) => (
        <div key={c.name} className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground">
            <span className={cn("size-2 rounded-full", c.tone)} />
            {c.name}
          </div>
          {Array.from({ length: c.n }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border bg-card p-2.5 shadow-sm"
            >
              <div className={cn(bar, "h-1.5 w-3/4")} />
              <div className={cn(bar, "mt-1.5 h-1.5 w-1/2")} />
              <div className="mt-2 flex items-center justify-between">
                <div className="size-4 rounded-full bg-primary/70" />
                <div className={cn(bar, "h-1.5 w-6")} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CampaignsMock() {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <div className={cn(bar, "h-2 w-1/3")} />
        <div className="mt-3 space-y-1.5">
          <div className={cn(bar, "h-1.5 w-full")} />
          <div className={cn(bar, "h-1.5 w-11/12")} />
          <div className={cn(bar, "h-1.5 w-2/3")} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { k: "Sent", v: "4,820" },
          { k: "Opened", v: "63%" },
          { k: "Replied", v: "18%" },
        ].map((s) => (
          <div
            key={s.k}
            className="rounded-lg border bg-card p-3 text-center shadow-sm"
          >
            <div className="text-base font-extrabold text-foreground">
              {s.v}
            </div>
            <div className="text-[10px] text-muted-foreground">{s.k}</div>
          </div>
        ))}
      </div>
      <div className="flex-1 rounded-lg bg-primary p-3">
        <div className="h-1.5 w-1/4 rounded-full bg-primary-foreground" />
        <div className="mt-2 flex items-end gap-1.5">
          {[40, 65, 50, 80, 60, 90, 70].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm bg-primary-foreground/30"
              style={{ height: `${h * 0.4}px` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function WorkflowsMock() {
  const node =
    "rounded-lg border bg-card px-3 py-2 shadow-sm flex items-center gap-2";
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className={cn(node, "w-2/3")}>
        <span className="size-2.5 rounded-full bg-primary" />
        <div className={cn(bar, "h-1.5 w-2/3")} />
      </div>
      <div className="h-4 w-px bg-border" />
      <div className={cn(node, "w-2/3")}>
        <span className="size-2.5 rounded-full bg-amber-500" />
        <div className={cn(bar, "h-1.5 w-1/2")} />
      </div>
      <div className="h-4 w-px bg-border" />
      <div className="grid w-full grid-cols-2 gap-3">
        <div className={node}>
          <span className="size-2.5 rounded-full bg-emerald-500" />
          <div className={cn(bar, "h-1.5 w-1/2")} />
        </div>
        <div className={node}>
          <span className="size-2.5 rounded-full bg-sky-500" />
          <div className={cn(bar, "h-1.5 w-1/2")} />
        </div>
      </div>
    </div>
  );
}

function ReportsMock() {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        {[
          { k: "Pipeline", v: "$3.2M" },
          { k: "Win rate", v: "42%" },
        ].map((s) => (
          <div key={s.k} className="rounded-lg border bg-card p-3 shadow-sm">
            <div className="text-[10px] text-muted-foreground">{s.k}</div>
            <div className="text-lg font-extrabold text-foreground">{s.v}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-1 items-end gap-2 rounded-lg border bg-card p-4 shadow-sm">
        {[45, 60, 55, 75, 68, 88, 95].map((h, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t-sm bg-primary"
              style={{ height: `${h}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
