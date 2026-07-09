"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Play, Pause, Flag, Users, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { enrollWorkflow, setWorkflowStatus } from "../actions";
import type { WorkflowStatus } from "@/lib/workflows";
import { cn } from "@/lib/utils";

const TRIGGER_VARIANT: Record<WorkflowStatus, string> = {
  draft: "text-muted-foreground",
  running: "text-green-700 dark:text-green-400",
  paused: "text-amber-700 dark:text-amber-400",
  ended: "text-destructive",
};

/**
 * Workflow lifecycle control, rendered as a status dropdown mirroring the
 * campaign status menu: the trigger shows the current status and the menu
 * offers the transitions valid from it — Set live, Pause, Resume, End — plus a
 * manual "Enroll segment now" for manual/segment-entry workflows.
 */
export function WorkflowStatusMenu({
  workflowId,
  status,
  canEnroll,
  align = "end",
}: {
  workflowId: string;
  status: WorkflowStatus;
  /** Manual / segment-entry workflow with a target segment — enrollable on demand. */
  canEnroll: boolean;
  align?: "start" | "end";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = React.useState<{
    title: string;
    body: string;
    error?: boolean;
  } | null>(null);

  function transition(to: WorkflowStatus, failTitle: string) {
    start(async () => {
      const res = await setWorkflowStatus(workflowId, to);
      if (res.error) setResult({ title: failTitle, body: res.error, error: true });
      router.refresh();
    });
  }

  async function doEnroll() {
    const res = await enrollWorkflow(workflowId);
    if (res.error) {
      setResult({ title: "Couldn't enroll", body: res.error, error: true });
    } else {
      setResult({
        title: "Contacts enrolled",
        body: `Enrolled ${res.enrolled ?? 0} contact${
          (res.enrolled ?? 0) === 1 ? "" : "s"
        }${res.skipped ? `, skipped ${res.skipped}` : ""}.`,
      });
    }
    router.refresh();
  }

  const label = status[0].toUpperCase() + status.slice(1);
  const terminal = status === "ended";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={pending || terminal}
            className={cn("gap-1.5", TRIGGER_VARIANT[status])}
          >
            {label}
            {!terminal && <ChevronDown className="size-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align}>
          {status === "draft" && (
            <DropdownMenuItem
              onClick={() => transition("running", "Couldn't set live")}
            >
              <Play /> Set live
            </DropdownMenuItem>
          )}

          {status === "running" && (
            <DropdownMenuItem onClick={() => transition("paused", "Couldn't pause")}>
              <Pause /> Pause
            </DropdownMenuItem>
          )}

          {status === "paused" && (
            <DropdownMenuItem
              onClick={() => transition("running", "Couldn't resume")}
            >
              <Play /> Resume
            </DropdownMenuItem>
          )}

          {canEnroll && (
            <ConfirmDialog
              trigger={
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  <Users /> Enroll segment now
                </DropdownMenuItem>
              }
              title="Enroll the target segment?"
              description="This enrolls the workflow's target segment and starts their runs. Contacts already in an active run are skipped."
              confirmLabel="Enroll"
              pendingLabel="Enrolling…"
              variant="default"
              onConfirm={doEnroll}
            />
          )}

          {(status === "running" || status === "paused") && (
            <>
              <DropdownMenuSeparator />
              <ConfirmDialog
                trigger={
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={(e) => e.preventDefault()}
                  >
                    <Flag /> End
                  </DropdownMenuItem>
                }
                title="End this workflow?"
                description="Ending stops the workflow for good — its triggers won't fire and it won't run again. Unlike pausing, it can't be resumed. To run it again, duplicate the workflow."
                confirmLabel="End workflow"
                pendingLabel="Ending…"
                variant="destructive"
                onConfirm={async () => {
                  const res = await setWorkflowStatus(workflowId, "ended");
                  if (res.error)
                    setResult({
                      title: "Couldn't end workflow",
                      body: res.error,
                      error: true,
                    });
                  router.refresh();
                }}
              />
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{result?.title}</DialogTitle>
            <DialogDescription
              className={result?.error ? "text-destructive" : undefined}
            >
              {result?.body}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button>Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
