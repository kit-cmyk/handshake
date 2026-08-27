import { Suspense } from "react";
import { Handshake } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { NavButton } from "@/components/nav-button";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { DESTINATIONS } from "@/lib/nav";
import { HeadlineStats } from "./headline-stats";
import { ActionQueue } from "./action-queue";
import { Breakdowns } from "./breakdowns";
import { DataHealth } from "./data-health";
import { RevenueChart } from "./revenue-chart";
import { loadHeadline, loadWorkspaceState } from "./queries";
import { revenueSeries } from "./metrics";

/**
 * The workspace home.
 *
 * Order matters here: the money first, then the worklist, then the supporting
 * detail. Each block is its own Suspense boundary, so the headline paints as
 * soon as its three queries land rather than waiting on the slowest section.
 *
 * `now` is resolved once and threaded down, so every section agrees on where
 * "this month" starts even if they resolve seconds apart.
 */
export default async function DashboardPage() {
  const { empty } = await loadWorkspaceState();
  const now = new Date();

  if (empty) return <NewWorkspace />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={DESTINATIONS.dashboard.label}
        description={DESTINATIONS.dashboard.description}
        actions={
          <>
            <NavButton to="leads" />
            <NavButton to="import" />
          </>
        }
      />

      <Suspense fallback={<StripSkeleton />}>
        <HeadlineStats now={now} />
      </Suspense>

      <Suspense fallback={null}>
        <DataHealth />
      </Suspense>

      <Suspense fallback={<BlockSkeleton height="h-64" />}>
        <ActionQueue now={now} />
      </Suspense>

      <Suspense fallback={<BlockSkeleton height="h-56" />}>
        <RevenuePanel now={now} />
      </Suspense>

      <Suspense fallback={<BlockSkeleton height="h-56" />}>
        <Breakdowns />
      </Suspense>
    </div>
  );
}

/**
 * The revenue trend. Re-reads the headline data, which costs nothing extra —
 * `requireContext` is request-cached and the underlying view query is the same
 * one the KPI strip already issued in this render.
 */
async function RevenuePanel({ now }: { now: Date }) {
  const { revenue, hasMetrics } = await loadHeadline(now);
  if (!hasMetrics) return null;

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Revenue won · last 6 months
      </h3>
      <RevenueChart data={revenueSeries(revenue, now, 6)} />
    </Card>
  );
}

/**
 * A workspace with nothing in it. Four zeroes and six shortcuts was the worst
 * possible first impression; this names the three things that actually start
 * the product working, and costs two counts instead of a dozen queries.
 */
function NewWorkspace() {
  return (
    <div className="space-y-6">
      <PageHeader
        title={DESTINATIONS.dashboard.label}
        description={DESTINATIONS.dashboard.description}
      />
      <EmptyState
        icon={Handshake}
        title="Let's fill this workspace"
        description="Add the businesses you're chasing and this turns into your daily worklist — what's due, who replied, and what's gone quiet."
      >
        <NavButton to="leads" />
        <NavButton to="import" />
        <NavButton to="contacts" />
      </EmptyState>
    </div>
  );
}

function StripSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="h-[104px] animate-pulse bg-muted/40 p-4" />
      ))}
    </div>
  );
}

/** Fixed heights, so streaming sections don't shove the page around. */
function BlockSkeleton({ height }: { height: string }) {
  return <Card className={`${height} animate-pulse bg-muted/40`} />;
}
