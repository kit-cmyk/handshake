"use client";

import * as React from "react";
import { useTransition } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
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

/** What `onConfirm` may report back. Returning nothing means "it worked". */
export type ConfirmResult = { ok?: boolean; error?: string } | void;

/**
 * A confirmation modal for destructive (or otherwise irreversible) actions.
 *
 * Pass the button/menu-item that opens it as `trigger`. When triggering from
 * inside a DropdownMenu, add `onSelect={(e) => e.preventDefault()}` to the menu
 * item so the menu doesn't close before the dialog opens.
 *
 * If `onConfirm` returns `{ error }`, the dialog stays open and shows it rather
 * than closing on a failure the user would otherwise never see.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  pendingLabel = "Working…",
  variant = "destructive",
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pendingLabel?: string;
  variant?: ButtonProps["variant"];
  onConfirm: () => ConfirmResult | Promise<ConfirmResult>;
}) {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await onConfirm();
        if (res && res.error) {
          setError(res.error);
          return;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button variant={variant} onClick={handleConfirm} disabled={pending}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
