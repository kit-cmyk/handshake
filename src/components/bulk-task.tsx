"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Minus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Status = "running" | "cancelling" | "done" | "cancelled" | "error";

type TaskState = {
  /** Present-tense label while running, e.g. "Deleting". */
  verb: string;
  /** Past-tense label on completion, e.g. "Deleted". */
  doneVerb: string;
  /** Singular noun for the records, e.g. "contact". */
  noun: string;
  total: number;
  done: number;
  status: Status;
  error?: string;
};

export type BulkRunOptions = {
  ids: string[];
  /** Singular noun, e.g. "contact". */
  noun: string;
  /**
   * Acts on one chunk of ids in a single call. Runs server-side, so the whole
   * chunk is one round-trip. Should resolve to `{ error }` on failure.
   */
  action: (chunk: string[]) => Promise<{ error?: string } | unknown>;
  /** Ids processed per server round-trip. Default 100. */
  chunkSize?: number;
  /** Called once after the run finishes with at least one record processed. */
  onDone?: () => void;
  /** Present-tense verb for the progress label. Default "Processing". */
  verb?: string;
  /** Past-tense verb for the completion label. Default "Processed". */
  doneVerb?: string;
};

type Ctx = {
  task: TaskState | null;
  docked: boolean;
  running: boolean;
  run: (opts: BulkRunOptions) => Promise<void>;
  cancel: () => void;
  dock: () => void;
  undock: () => void;
  dismiss: () => void;
};

const BulkTaskContext = React.createContext<Ctx | null>(null);

export function useBulkTask() {
  const ctx = React.useContext(BulkTaskContext);
  if (!ctx)
    throw new Error("useBulkTask must be used within <BulkTaskProvider>");
  return ctx;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Runs bulk actions as a single background task the user can minimize ("dock")
 * or abort ("cancel"). Work is split into chunks so each chunk is one server
 * round-trip (fast) and cancellation can stop cleanly between chunks.
 *
 * Lives in the app layout, so a docked task keeps running while the user
 * navigates and works elsewhere.
 */
export function BulkTaskProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [task, setTask] = React.useState<TaskState | null>(null);
  const [docked, setDocked] = React.useState(false);
  const cancelRef = React.useRef(false);
  const runningRef = React.useRef(false);
  const dismissTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  };

  const dismiss = React.useCallback(() => {
    clearTimer();
    setTask(null);
    setDocked(false);
  }, []);

  const run = React.useCallback(
    async (opts: BulkRunOptions) => {
      // One task at a time — the trigger buttons disable while running, but
      // guard here too against a double-fire. Claim the slot before the first
      // await so two rapid calls can't both get through.
      if (runningRef.current) return;
      runningRef.current = true;
      const {
        ids,
        noun,
        action,
        chunkSize = 100,
        onDone,
        verb = "Processing",
        doneVerb = "Processed",
      } = opts;
      if (!ids.length) {
        runningRef.current = false;
        return;
      }

      // Escape the caller's React transition. BulkDeleteButton starts this run
      // from inside ConfirmDialog's startTransition; without this yield, every
      // setTask below is treated as a deferred transition update and React
      // holds the whole progress UI (bar, Dock, Cancel) until the run ends —
      // so the user never sees progress and can't dock or cancel. A macrotask
      // hop puts our updates back on the urgent path.
      await new Promise((r) => setTimeout(r, 0));

      clearTimer();
      cancelRef.current = false;
      setDocked(false);
      setTask({
        verb,
        doneVerb,
        noun,
        total: ids.length,
        done: 0,
        status: "running",
      });

      let done = 0;
      let failure: string | undefined;

      for (const batch of chunk(ids, chunkSize)) {
        if (cancelRef.current) break;
        try {
          const res = (await action(batch)) as { error?: string } | undefined;
          if (res && typeof res === "object" && "error" in res && res.error) {
            failure = res.error;
            break;
          }
        } catch (e) {
          failure = e instanceof Error ? e.message : "Something went wrong.";
          break;
        }
        done += batch.length;
        setTask((t) => (t ? { ...t, done } : t));
      }

      runningRef.current = false;

      // Reflect whatever was processed and release the caller's selection.
      if (done > 0) {
        onDone?.();
        router.refresh();
      }

      if (failure) {
        setTask((t) => (t ? { ...t, status: "error", error: failure, done } : t));
      } else if (cancelRef.current) {
        setTask((t) => (t ? { ...t, status: "cancelled", done } : t));
        dismissTimer.current = setTimeout(dismiss, 6000);
      } else {
        setTask((t) => (t ? { ...t, status: "done", done } : t));
        dismissTimer.current = setTimeout(dismiss, 4000);
      }
    },
    [router, dismiss],
  );

  const cancel = React.useCallback(() => {
    if (!runningRef.current) return;
    cancelRef.current = true;
    setTask((t) => (t ? { ...t, status: "cancelling" } : t));
  }, []);

  const dock = React.useCallback(() => setDocked(true), []);
  const undock = React.useCallback(() => setDocked(false), []);

  React.useEffect(() => () => clearTimer(), []);

  const value: Ctx = {
    task,
    docked,
    running: task?.status === "running" || task?.status === "cancelling",
    run,
    cancel,
    dock,
    undock,
    dismiss,
  };

  return (
    <BulkTaskContext.Provider value={value}>
      {children}
      {task ? <BulkTaskOverlay /> : null}
    </BulkTaskContext.Provider>
  );
}

function plural(noun: string, n: number) {
  return n === 1 ? noun : `${noun}s`;
}

function BulkTaskOverlay() {
  const { task, docked, running, cancel, dock, undock, dismiss } = useBulkTask();
  if (!task) return null;

  const pct = task.total ? Math.round((task.done / task.total) * 100) : 0;

  // Minimized "docked" state: a small pill in the corner. Click to expand.
  if (docked) {
    return (
      <button
        type="button"
        onClick={undock}
        aria-label={`${task.verb}: ${task.done} of ${task.total} — click to expand`}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border bg-card px-3.5 py-2 text-sm font-medium shadow-lg outline-none transition-shadow hover:shadow-xl focus-visible:ring-2 focus-visible:ring-ring"
      >
        {running ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : task.status === "error" ? (
          <AlertTriangle className="size-4 shrink-0 text-destructive" />
        ) : (
          <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
        )}
        <span className="tabular-nums">
          {task.done}/{task.total}
        </span>
      </button>
    );
  }

  const StatusIcon =
    task.status === "error"
      ? AlertTriangle
      : task.status === "done" || task.status === "cancelled"
        ? CheckCircle2
        : Loader2;

  const title =
    task.status === "error"
      ? `${task.verb} failed`
      : task.status === "cancelling"
        ? "Cancelling…"
        : task.status === "cancelled"
          ? "Cancelled"
          : task.status === "done"
            ? `${task.doneVerb} ${task.done} ${plural(task.noun, task.done)}`
            : `${task.verb} ${task.total} ${plural(task.noun, task.total)}…`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border bg-card p-4 shadow-xl"
    >
      <div className="flex items-start gap-3">
        <StatusIcon
          className={cn(
            "mt-0.5 size-5 shrink-0",
            task.status === "error"
              ? "text-destructive"
              : task.status === "done" || task.status === "cancelled"
                ? "text-emerald-500"
                : "animate-spin text-muted-foreground",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight">{title}</p>
          {task.status === "error" ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {task.error}
              {task.done > 0
                ? ` (${task.done} ${plural(task.noun, task.done)} already ${task.doneVerb.toLowerCase()})`
                : ""}
            </p>
          ) : task.status === "cancelled" ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {task.doneVerb} {task.done} of {task.total} before stopping.
            </p>
          ) : (
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              {task.done} of {task.total}
            </p>
          )}
        </div>

        {/* Top-right controls: dock while running, else dismiss. */}
        {running ? (
          <button
            type="button"
            onClick={dock}
            aria-label="Minimize"
            className="shrink-0 rounded-md p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Minus className="size-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="shrink-0 rounded-md p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Progress bar (only while there's work in flight). */}
      {running ? (
        <>
          <div
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={task.total}
            aria-valuenow={task.done}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={dock}
            >
              Dock
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-destructive hover:text-destructive"
              onClick={cancel}
              disabled={task.status === "cancelling"}
            >
              {task.status === "cancelling" ? "Cancelling…" : "Cancel"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
