"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { refreshSnapshot, deleteSegment } from "../actions";

export function RefreshButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await refreshSnapshot(id);
          router.refresh();
        })
      }
    >
      <RefreshCw className="size-4" />
      {pending ? "Refreshing…" : "Refresh snapshot"}
    </Button>
  );
}

export function DeleteSegmentButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          <Trash2 className="size-4" /> Delete
        </Button>
      }
      title="Delete segment?"
      description="This permanently deletes the segment. Contacts themselves are not affected. This can't be undone."
      onConfirm={async () => {
        const res = await deleteSegment(id);
        if (res.ok) router.push("/segments");
      }}
    />
  );
}
