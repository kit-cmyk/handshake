"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

/**
 * Deletes each id via the given server action (after confirmation), then
 * refreshes. Used as a bulk action inside DataTable toolbars.
 */
export function BulkDeleteButton({
  ids,
  action,
  onDone,
  noun = "item",
}: {
  ids: string[];
  action: (id: string) => Promise<unknown>;
  onDone?: () => void;
  /** Singular noun, e.g. "contact". */
  noun?: string;
}) {
  const router = useRouter();
  const count = ids.length;
  const label = count === 1 ? noun : `${noun}s`;

  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-destructive hover:text-destructive"
        >
          <Trash2 className="size-4" /> Delete
        </Button>
      }
      title={`Delete ${count} ${label}?`}
      description="This permanently deletes the selected records. This can't be undone."
      confirmLabel={`Delete ${count} ${label}`}
      pendingLabel="Deleting…"
      onConfirm={async () => {
        for (const id of ids) await action(id);
        onDone?.();
        router.refresh();
      }}
    />
  );
}
