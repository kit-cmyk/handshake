"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateWorkspace, type WorkspaceState } from "./workspace-actions";

export function WorkspaceForm({
  name,
  bookingUrl,
  canManage,
}: {
  name: string;
  bookingUrl: string;
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState<WorkspaceState, FormData>(
    updateWorkspace,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="name">Workspace name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={name}
          maxLength={80}
          disabled={!canManage}
          className="max-w-sm"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="booking_url">Booking link</Label>
        <Input
          id="booking_url"
          name="booking_url"
          type="url"
          inputMode="url"
          placeholder="https://cal.com/you/30min"
          defaultValue={bookingUrl}
          disabled={!canManage}
          className="max-w-sm"
        />
        <p className="text-xs text-muted-foreground">
          Your scheduling URL. Insert it into any email with the{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
            {"{{booking_link}}"}
          </code>{" "}
          field so recipients can book a time.
        </p>
      </div>
      <div aria-live="polite">
        {state.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        {state.message && (
          <p className="text-sm text-green-600">{state.message}</p>
        )}
      </div>
      {canManage ? (
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save workspace"}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Only workspace admins can rename the workspace.
        </p>
      )}
    </form>
  );
}
