"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateWorkspace, type WorkspaceState } from "./workspace-actions";

export function WorkspaceForm({
  name,
  canManage,
}: {
  name: string;
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
