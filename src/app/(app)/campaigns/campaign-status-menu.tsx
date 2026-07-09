"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  Play,
  Pause,
  StopCircle,
  Archive,
  RotateCcw,
  ChevronDown,
} from "lucide-react";
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
import {
  enrollCampaign,
  setCampaignStatus,
  endCampaign,
  type SkipReasons,
} from "./actions";
import { type CampaignStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Turn the per-reason skip counts into a short readable clause. */
function summarizeReasons(r?: SkipReasons): string {
  if (!r) return "";
  const parts: string[] = [];
  if (r.already) parts.push(`${r.already} already enrolled`);
  if (r.no_email) parts.push(`${r.no_email} without an email`);
  if (r.unsubscribed) parts.push(`${r.unsubscribed} unsubscribed`);
  if (r.suppressed) parts.push(`${r.suppressed} suppressed`);
  if (r.excluded) parts.push(`${r.excluded} excluded`);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

const TRIGGER_VARIANT: Record<CampaignStatus, string> = {
  draft: "text-muted-foreground",
  active: "text-green-700 dark:text-green-400",
  paused: "text-amber-700 dark:text-amber-400",
  archived: "text-muted-foreground",
  ended: "text-destructive",
};

/**
 * The campaign lifecycle control, rendered as a status dropdown: the trigger
 * shows the current status and the menu offers the transitions valid from it —
 * Run (enroll + send), Pause, Resume, End, Archive, Restore. Reused on the
 * campaigns table (per row) and the campaign detail header, so the lifecycle
 * behaves identically in both places. Results (and any errors) surface in a
 * small dialog since there's no toast layer.
 */
export function CampaignStatusMenu({
  campaignId,
  status,
  hasSegment,
  audienceCount,
  align = "end",
}: {
  campaignId: string;
  status: CampaignStatus;
  hasSegment: boolean;
  /** Optional — shown in the Run confirmation when known (detail page). */
  audienceCount?: number;
  align?: "start" | "end";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = React.useState<{
    title: string;
    body: string;
    error?: boolean;
  } | null>(null);

  function transition(to: CampaignStatus, failTitle: string) {
    start(async () => {
      const res = await setCampaignStatus(campaignId, to);
      if (res.error) setResult({ title: failTitle, body: res.error, error: true });
      router.refresh();
    });
  }

  async function doRun() {
    const res = await enrollCampaign(campaignId);
    if (res.error) {
      setResult({ title: "Couldn't run campaign", body: res.error, error: true });
    } else {
      setResult({
        title: "Campaign is running",
        body: `Enrolled ${res.enrolled ?? 0} contact${
          (res.enrolled ?? 0) === 1 ? "" : "s"
        }${
          res.skipped
            ? `, skipped ${res.skipped}${summarizeReasons(res.reasons)}`
            : ""
        }.`,
      });
    }
    router.refresh();
  }

  async function doEnd() {
    const res = await endCampaign(campaignId);
    if (res.error)
      setResult({ title: "Couldn't end campaign", body: res.error, error: true });
    router.refresh();
  }

  const label = status[0].toUpperCase() + status.slice(1);
  const terminal = status === "ended";

  const runDescription =
    audienceCount != null
      ? `This enrolls up to ${audienceCount} contact${
          audienceCount === 1 ? "" : "s"
        } and begins sending. Contacts already enrolled, unsubscribed, or suppressed are skipped automatically.`
      : "This enrolls the campaign's audience and begins sending. Contacts already enrolled, unsubscribed, or suppressed are skipped automatically.";

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
            <ConfirmDialog
              trigger={
                <DropdownMenuItem
                  disabled={!hasSegment}
                  onSelect={(e) => e.preventDefault()}
                >
                  <Play /> Run campaign
                </DropdownMenuItem>
              }
              title="Run this campaign?"
              description={runDescription}
              confirmLabel="Run & send"
              pendingLabel="Starting…"
              variant="default"
              onConfirm={doRun}
            />
          )}

          {status === "active" && (
            <DropdownMenuItem onClick={() => transition("paused", "Couldn't pause")}>
              <Pause /> Pause
            </DropdownMenuItem>
          )}

          {status === "paused" && (
            <DropdownMenuItem onClick={() => transition("active", "Couldn't resume")}>
              <Play /> Resume
            </DropdownMenuItem>
          )}

          {(status === "active" || status === "paused") && (
            <ConfirmDialog
              trigger={
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={(e) => e.preventDefault()}
                >
                  <StopCircle /> End
                </DropdownMenuItem>
              }
              title="End this campaign?"
              description="This ends the campaign for good and stops every in-flight sequence — enrolled contacts stop receiving emails. Unlike pausing, it can't be resumed. To run the sequence again, duplicate the campaign."
              confirmLabel="End campaign"
              pendingLabel="Ending…"
              variant="destructive"
              onConfirm={doEnd}
            />
          )}

          {(status === "active" || status === "paused") && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => transition("archived", "Couldn't archive")}
              >
                <Archive /> Archive
              </DropdownMenuItem>
            </>
          )}

          {status === "archived" && (
            <DropdownMenuItem
              onClick={() => transition("paused", "Couldn't restore")}
            >
              <RotateCcw /> Restore
            </DropdownMenuItem>
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
