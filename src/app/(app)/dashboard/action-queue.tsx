import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  Mail,
  Phone,
  StickyNote,
  TimerReset,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/badge";
import { NavButton } from "@/components/nav-button";
import { money, timeAgo } from "@/lib/utils";
import { loadActionQueue, type TaskRow } from "./queries";

/**
 * The worklist — the half of the dashboard that tells you what to *do* rather
 * than how you're doing.
 *
 * Everything here has been sitting in the schema unread: `activities` has
 * carried `due_at`/`done_at` since the first migration and nothing in the app
 * has ever aggregated it.
 */
export async function ActionQueue({ now }: { now: Date }) {
  const { tasks, overdueCount, replies, repliesTruncated, stalled } =
    await loadActionQueue(now);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Section
        title="Due now"
        count={overdueCount}
        className="lg:col-span-2"
        empty={tasks.length === 0}
        emptyText="You're clear. Nothing is due today."
      >
        <ul className="divide-y">
          {tasks.map((t) => (
            <TaskItem key={t.id} task={t} now={now} />
          ))}
        </ul>
      </Section>

      <div className="space-y-4">
        <Section
          title="Unread replies"
          count={replies.length}
          countSuffix={repliesTruncated ? "+" : undefined}
          empty={replies.length === 0}
          emptyText="Inbox is quiet."
          emptyAction={<NavButton to="inbox" size="sm" />}
        >
          <ul className="divide-y">
            {replies.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/inbox?c=${r.id}`}
                  className="block py-2 hover:text-foreground"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {r.contactName}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {timeAgo(r.at)}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.snippet || r.subject || "New reply"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="Gone quiet"
          count={stalled.length}
          empty={stalled.length === 0}
          emptyText="Every open deal has been touched in the last two weeks."
        >
          <ul className="divide-y">
            {stalled.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/pipeline/${d.id}`}
                  className="block py-2 hover:text-foreground"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {d.title}
                    </span>
                    <span className="shrink-0 text-xs font-medium tabular-nums">
                      {money(d.value)}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.company ? `${d.company} · ` : ""}
                    last touched {timeAgo(d.updatedAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

const TASK_ICON: Record<string, LucideIcon> = {
  task: CheckCircle2,
  appointment: CalendarClock,
  call: Phone,
  email: Mail,
  note: StickyNote,
};

function TaskItem({ task, now }: { task: TaskRow; now: Date }) {
  const Icon = TASK_ICON[task.type] ?? CheckCircle2;
  const overdue = new Date(task.dueAt).getTime() < now.getTime();
  // A task hanging off a deal is best worked from the deal; otherwise the
  // contact is the next-best place to act.
  const href = task.dealId
    ? `/pipeline/${task.dealId}`
    : task.contactId
      ? `/contacts/${task.contactId}`
      : "/pipeline";
  const subject = task.dealTitle ?? task.contactName;

  return (
    <li>
      <Link
        href={href}
        className="flex items-start gap-3 py-2.5 hover:text-foreground"
      >
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {task.body?.trim() || "Untitled task"}
          </p>
          {subject ? (
            <p className="truncate text-xs text-muted-foreground">{subject}</p>
          ) : null}
        </div>
        <span
          className={
            overdue
              ? "shrink-0 text-xs font-medium text-destructive"
              : "shrink-0 text-xs text-muted-foreground"
          }
        >
          {dueLabel(task.dueAt, now)}
        </span>
      </Link>
    </li>
  );
}

/**
 * How late, or how soon. Deliberately coarse — the exact minute a task was due
 * three days ago is noise; that it is three days late is the point.
 */
function dueLabel(iso: string, now: Date): string {
  const diff = new Date(iso).getTime() - now.getTime();
  const mins = Math.round(Math.abs(diff) / 60000);
  const late = diff < 0;

  if (mins < 60) return late ? "overdue" : "due soon";
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return late ? `${hrs}h late` : `in ${hrs}h`;
  const days = Math.round(hrs / 24);
  return late ? `${days}d late` : `in ${days}d`;
}

function Section({
  title,
  count,
  countSuffix,
  children,
  empty,
  emptyText,
  emptyAction,
  className,
}: {
  title: string;
  count?: number;
  /** e.g. "+" when the count was capped by a scan window. */
  countSuffix?: string;
  children: React.ReactNode;
  empty: boolean;
  emptyText: string;
  emptyAction?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`p-4 ${className ?? ""}`}>
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
        {!empty && count ? (
          <span className="inline-flex items-center gap-0.5">
            <CountBadge count={count} />
            {countSuffix ? (
              <span className="text-xs text-muted-foreground">
                {countSuffix}
              </span>
            ) : null}
          </span>
        ) : null}
      </h3>

      {empty ? (
        // A clear queue is a result, not a void — say so plainly rather than
        // showing an illustration that implies something is missing.
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <TimerReset className="size-4 shrink-0" />
          <span className="flex-1">{emptyText}</span>
          {emptyAction}
        </div>
      ) : (
        <div className="mt-1">{children}</div>
      )}
    </Card>
  );
}
