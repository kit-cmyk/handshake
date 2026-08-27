"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  deleteSegment,
  duplicateSegment,
  exportSegment,
  getSegmentUsage,
  type SegmentUsage,
} from "./actions";

/**
 * Delete confirmation that first asks what would break. A segment can be a live
 * campaign's audience or a running workflow's trigger, and both FKs are
 * `on delete set null` — so without this the campaign silently loses its
 * audience and nobody finds out until it sends to nobody.
 */
export function DeleteSegmentDialog({
  id,
  name,
  trigger,
  onDeleted,
}: {
  id: string;
  name: string;
  trigger: React.ReactNode;
  onDeleted?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [usage, setUsage] = React.useState<SegmentUsage | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getSegmentUsage(id).then((u) => !cancelled && setUsage(u));
    return () => {
      cancelled = true;
    };
  }, [open, id]);

  const referenced =
    (usage?.campaigns.length ?? 0) + (usage?.workflows.length ?? 0);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const res = await deleteSegment(id);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      onDeleted?.();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Clear on close, so reopening shows "checking…" rather than a stale
        // answer from the last time this dialog was open.
        if (!next) {
          setError(null);
          setUsage(null);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{name}”?</DialogTitle>
          <DialogDescription>
            This permanently deletes the segment. Contacts themselves are not
            affected. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>

        {usage === null ? (
          <p className="text-sm text-muted-foreground">
            Checking what uses this segment…
          </p>
        ) : referenced > 0 ? (
          <div className="flex gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="font-medium">
                {referenced} thing{referenced === 1 ? "" : "s"} still point
                {referenced === 1 ? "s" : ""} at this segment:
              </p>
              <ul className="list-inside list-disc text-muted-foreground">
                {usage.campaigns.map((c) => (
                  <li key={c.id}>
                    Campaign “{c.name}” ({c.status})
                  </li>
                ))}
                {usage.workflows.map((w) => (
                  <li key={w.id}>
                    Workflow “{w.name}” ({w.status})
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground">
                They keep running, but against nobody, until you point them at
                another segment.
              </p>
            </div>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? "Deleting…" : "Delete segment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Download the segment's members as a CSV. The server hands back cells; the
 * file is assembled here so nothing large has to round-trip as a string.
 */
export function useSegmentExport() {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(async (segmentId: string) => {
    setPending(true);
    setError(null);
    try {
      const res = await exportSegment(segmentId);
      if (res.error) {
        setError(res.error);
        return;
      }
      const csv = Papa.unparse(res.rows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPending(false);
    }
  }, []);

  return { run, pending, error };
}

/** Copy a segment (filter, and for a static list its members) and open the copy. */
export function useSegmentDuplicate() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const run = React.useCallback(
    async (segmentId: string) => {
      setPending(true);
      try {
        const res = await duplicateSegment(segmentId);
        if (res.id) router.push(`/segments/${res.id}`);
        else router.refresh();
      } finally {
        setPending(false);
      }
    },
    [router]
  );

  return { run, pending };
}
