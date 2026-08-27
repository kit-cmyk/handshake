"use client";

import * as React from "react";
import { useActionState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import { CountBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { FieldError, fieldErrorProps, errorFor } from "@/components/ui/field-error";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DATASETS } from "@/lib/data-erasure";
import { eraseDataset, eraseAllData, type EraseState } from "./data-actions";

const NUMBER = new Intl.NumberFormat("en-US");

/** Row counts keyed by dataset key, resolved on the server. */
export type DataCounts = Record<string, number>;

function Status({ state }: { state: EraseState }) {
  if (!state.error && !state.message) return null;
  return (
    <p
      aria-live="polite"
      className={
        state.error ? "text-sm text-destructive" : "text-sm text-green-600"
      }
    >
      {state.error ?? state.message}
    </p>
  );
}

export function DataManager({
  counts,
  canManage,
  workspaceName,
}: {
  counts: DataCounts;
  canManage: boolean;
  workspaceName: string;
}) {
  const [state, setState] = React.useState<EraseState>({});
  const total = DATASETS.reduce((sum, d) => sum + (counts[d.key] ?? 0), 0);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delete data</CardTitle>
          <CardDescription>
            Remove a category of records from this workspace. Deletes are
            permanent and take their linked records with them — there is no undo
            and no export first, so download anything you need beforehand.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManage && (
            <p className="text-sm text-muted-foreground">
              Only workspace owners and admins can delete data.
            </p>
          )}
          <Status state={state} />

          <ul className="divide-y rounded-md border">
            {DATASETS.map((dataset) => {
              const count = counts[dataset.key] ?? 0;
              return (
                <li
                  key={dataset.key}
                  className="flex flex-wrap items-start justify-between gap-3 p-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {dataset.label}
                      </span>
                      <CountBadge count={count} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {dataset.description}
                    </p>
                  </div>

                  <ConfirmDialog
                    trigger={
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={!canManage || count === 0}
                      >
                        <Trash2 className="size-4" /> Delete
                      </Button>
                    }
                    title={`Delete all ${dataset.label.toLowerCase()}?`}
                    description={`This permanently deletes ${NUMBER.format(
                      count
                    )} ${
                      count === 1 ? "record" : "records"
                    } and everything linked to them. ${dataset.description}`}
                    confirmLabel="Delete permanently"
                    pendingLabel="Deleting…"
                    onConfirm={async () => {
                      setState(await eraseDataset(dataset.key));
                    }}
                  />
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <DangerZone
        canManage={canManage}
        workspaceName={workspaceName}
        total={total}
      />
    </>
  );
}

function DangerZone({
  canManage,
  workspaceName,
  total,
}: {
  canManage: boolean;
  workspaceName: string;
  total: number;
}) {
  const [state, action, pending] = useActionState<EraseState, FormData>(
    eraseAllData,
    {}
  );

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-destructive">
          <TriangleAlert className="size-4" /> Delete everything
        </CardTitle>
        <CardDescription>
          Empties every category above at once — {NUMBER.format(total)}{" "}
          {total === 1 ? "record" : "records"} in total. Your workspace, team,
          mailboxes, pipeline stages, and integrations are kept, so you can
          start over with a clean slate.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="confirm">
              Type <span className="font-medium">{workspaceName}</span> to
              confirm
            </Label>
            <Input
              id="confirm"
              name="confirm"
              autoComplete="off"
              placeholder={workspaceName}
              className="max-w-xs"
              disabled={!canManage}
              {...fieldErrorProps("confirm", Boolean(errorFor(state, "confirm", "confirm")))}
            />
            <FieldError id="confirm">
              {errorFor(state, "confirm", "confirm")}
            </FieldError>
          </div>
          {state.message && (
            <p aria-live="polite" className="text-sm text-green-600">
              {state.message}
            </p>
          )}
          <Button
            type="submit"
            variant="destructive"
            disabled={!canManage || pending}
          >
            {pending ? "Deleting…" : "Delete all workspace data"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
