"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Copy, Download, MoreHorizontal, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DeleteSegmentDialog,
  useSegmentDuplicate,
  useSegmentExport,
} from "../segment-row-actions";
import { refreshSnapshot } from "../actions";

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

/** Export / duplicate / delete, folded into one overflow menu. */
export function SegmentActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const exporter = useSegmentExport();
  const duplicator = useSegmentDuplicate();

  return (
    <>
      {exporter.error && (
        <span role="alert" className="text-sm font-medium text-destructive">
          {exporter.error}
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-8">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">More segment actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={exporter.pending}
            onSelect={() => void exporter.run(id)}
          >
            <Download className="size-4" /> Export CSV
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={duplicator.pending}
            onSelect={() => void duplicator.run(id)}
          >
            <Copy className="size-4" /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DeleteSegmentDialog
            id={id}
            name={name}
            onDeleted={() => router.push("/segments")}
            trigger={
              <DropdownMenuItem
                className="text-destructive"
                onSelect={(e) => e.preventDefault()}
              >
                <Trash2 className="size-4" /> Delete
              </DropdownMenuItem>
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
