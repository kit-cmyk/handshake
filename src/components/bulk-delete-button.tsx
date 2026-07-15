"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useBulkTask } from "@/components/bulk-task";

/**
 * Confirms, then hands the selected ids to the background bulk-task runner,
 * which deletes them in chunks (one server round-trip per chunk) and shows a
 * dockable, cancellable progress toast. Used inside DataTable toolbars.
 */
export function BulkDeleteButton({
  ids,
  action,
  onDone,
  noun = "item",
}: {
  ids: string[];
  /** Deletes an entire chunk of ids in a single server call. */
  action: (ids: string[]) => Promise<{ error?: string } | unknown>;
  onDone?: () => void;
  /** Singular noun, e.g. "contact". */
  noun?: string;
}) {
  const bulk = useBulkTask();
  const count = ids.length;
  const label = count === 1 ? noun : `${noun}s`;

  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-destructive hover:text-destructive"
          disabled={bulk.running}
        >
          <Trash2 className="size-4" /> Delete
        </Button>
      }
      title={`Delete ${count} ${label}?`}
      description="This permanently deletes the selected records. This can't be undone."
      confirmLabel={`Delete ${count} ${label}`}
      pendingLabel="Starting…"
      onConfirm={() => {
        // Fire and forget: the dialog closes and the docked task UI takes over.
        void bulk.run({
          ids,
          noun,
          action,
          verb: "Deleting",
          doneVerb: "Deleted",
          onDone,
        });
      }}
    />
  );
}
