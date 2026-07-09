import {
  StickyNote,
  Phone,
  CheckSquare,
  Mail,
  CalendarClock,
  Megaphone,
  Workflow,
  ArrowRightLeft,
} from "lucide-react";
import type { DealTimelineItem } from "./actions";
import type { ActivityType } from "@/lib/types";

const ACTIVITY_ICON: Record<ActivityType, typeof StickyNote> = {
  note: StickyNote,
  call: Phone,
  task: CheckSquare,
  email: Mail,
  appointment: CalendarClock,
};

const KIND_ICON = {
  campaign: Megaphone,
  workflow: Workflow,
  stage: ArrowRightLeft,
} as const;

function iconFor(item: DealTimelineItem) {
  if (item.kind === "activity" && item.activityType)
    return ACTIVITY_ICON[item.activityType];
  if (item.kind !== "activity") return KIND_ICON[item.kind];
  return StickyNote;
}

/** Read-only chronological log: activity, campaigns, workflows, pipeline moves. */
export function DealTimeline({ items }: { items: DealTimelineItem[] }) {
  if (!items.length) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No activity yet — add a note or book an appointment.
      </p>
    );
  }
  return (
    <ol className="space-y-4">
      {items.map((it) => {
        const Icon = iconFor(it);
        return (
          <li key={it.id} className="flex gap-3">
            <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border bg-muted/50 text-muted-foreground">
              <Icon className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="whitespace-pre-wrap text-sm">{it.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {it.subtitle && (
                  <span className="capitalize">{it.subtitle} · </span>
                )}
                {new Date(it.at).toLocaleString()}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
