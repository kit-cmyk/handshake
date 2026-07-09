"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  StickyNote,
  Phone,
  CheckSquare,
  Square,
  Mail,
  Trash2,
  CalendarClock,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toggleTaskDone, deleteActivity } from "./actions";
import type { Activity, ActivityType } from "@/lib/types";

const ICON: Record<ActivityType, typeof StickyNote> = {
  note: StickyNote,
  call: Phone,
  task: CheckSquare,
  email: Mail,
  appointment: CalendarClock,
};

export function ActivityItem({ activity }: { activity: Activity }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const Icon = ICON[activity.type];
  const done = !!activity.done_at;

  return (
    <li className="flex gap-3 py-3">
      <div className="mt-0.5 text-muted-foreground">
        {activity.type === "task" ? (
          <button
            onClick={() =>
              start(async () => {
                await toggleTaskDone(activity.id, activity.contact_id!, !done);
                router.refresh();
              })
            }
            disabled={pending}
            className="text-muted-foreground hover:text-foreground"
            aria-label={done ? "Mark not done" : "Mark done"}
          >
            {done ? (
              <CheckSquare className="size-4 text-green-600" />
            ) : (
              <Square className="size-4" />
            )}
          </button>
        ) : (
          <Icon className="size-4" />
        )}
      </div>
      <div className="flex-1">
        <p
          className={
            "text-sm whitespace-pre-wrap " +
            (done ? "text-muted-foreground line-through" : "")
          }
        >
          {activity.body}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="capitalize">{activity.type}</span>
          <span>·</span>
          <span>{new Date(activity.created_at).toLocaleString()}</span>
          {activity.due_at && (
            <>
              <span>·</span>
              <span>due {new Date(activity.due_at).toLocaleDateString()}</span>
            </>
          )}
        </div>
      </div>
      <ConfirmDialog
        trigger={
          <button
            disabled={pending}
            className="text-muted-foreground hover:text-destructive"
            aria-label="Delete activity"
          >
            <Trash2 className="size-4" />
          </button>
        }
        title="Delete this activity?"
        description="This permanently removes the note, call, task, or email from the timeline."
        onConfirm={async () => {
          await deleteActivity(activity.id, activity.contact_id!);
          router.refresh();
        }}
      />
    </li>
  );
}
