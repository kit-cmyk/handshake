import { Card } from "@/components/ui/card";

/**
 * Route-level skeleton. The dashboard's own Suspense boundaries handle
 * streaming once the page is rendering; this covers the gap before that — the
 * moment between clicking Dashboard in the sidebar and the server responding.
 *
 * Heights match the real sections so nothing jumps when content arrives.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded bg-muted" />
        <div className="h-4 w-56 animate-pulse rounded bg-muted" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="h-[104px] animate-pulse bg-muted/40" />
        ))}
      </div>

      <Card className="h-64 animate-pulse bg-muted/40" />
      <Card className="h-56 animate-pulse bg-muted/40" />
    </div>
  );
}
