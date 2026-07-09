"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { MoreHorizontal, Pencil, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { duplicateWorkflow, deleteWorkflow } from "../actions";

/**
 * The workflow detail "Actions" menu: edit, duplicate, and delete grouped
 * behind a single CTA. Status transitions live in the separate status dropdown
 * ([[workflow-status-menu]]). Mirrors the campaign actions menu.
 */
export function WorkflowActions({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={pending}>
            Actions <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/workflows/${workflowId}/edit`}>
              <Pencil /> Edit
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() =>
              start(async () => {
                setErr(null);
                const res = await duplicateWorkflow(workflowId);
                if (res.error) setErr(res.error);
                else if (res.id) router.push(`/workflows/${res.id}`);
              })
            }
          >
            <Copy /> Duplicate
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <ConfirmDialog
            trigger={
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={(e) => e.preventDefault()}
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            }
            title="Delete workflow?"
            description="This permanently deletes the workflow and its run history, and stops any in-flight runs. This can't be undone."
            onConfirm={async () => {
              const res = await deleteWorkflow(workflowId);
              if (res.ok) router.push("/workflows");
              else if (res.error) setErr(res.error);
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      {err && <p className="mt-1 text-sm text-destructive">{err}</p>}
    </>
  );
}
