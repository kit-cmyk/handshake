"use client";

import * as React from "react";
import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LIFECYCLE_STAGES,
  LIFECYCLE_LABELS,
  type LifecycleStage,
} from "@/lib/types";
import { updateStageLifecycle, type PipelineState } from "./pipeline-actions";

const NONE = "none";

type StageRow = {
  id: string;
  name: string;
  lifecycle_stage: LifecycleStage | null;
};

export function PipelineForm({
  stages,
  canManage,
}: {
  stages: StageRow[];
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState<PipelineState, FormData>(
    updateStageLifecycle,
    {},
  );
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(stages.map((s) => [s.id, s.lifecycle_stage ?? NONE])),
  );

  return (
    <form action={action} className="space-y-4">
      <div className="divide-y rounded-md border">
        {stages.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-4 px-3 py-2.5"
          >
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="truncate font-medium">{s.name}</span>
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
            </div>
            <input
              type="hidden"
              name={`stage:${s.id}`}
              value={values[s.id] === NONE ? "" : values[s.id]}
            />
            <Select
              value={values[s.id]}
              onValueChange={(v) =>
                setValues((prev) => ({ ...prev, [s.id]: v }))
              }
              disabled={!canManage}
            >
              <SelectTrigger className="w-44 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No mapping</SelectItem>
                {LIFECYCLE_STAGES.map((ls) => (
                  <SelectItem key={ls} value={ls}>
                    {LIFECYCLE_LABELS[ls]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
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
          {pending ? "Saving…" : "Save mapping"}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Only workspace admins can edit the pipeline mapping.
        </p>
      )}
    </form>
  );
}
