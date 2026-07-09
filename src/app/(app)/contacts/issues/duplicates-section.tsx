"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Merge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MergeGroup } from "./merge-group";
import { bulkMergeContacts } from "./actions";
import { defaultMergePlan } from "./merge-utils";
import { type DuplicateGroup } from "@/lib/data-quality";

/**
 * A set of duplicate groups with group-level multi-select for one-click bulk
 * merge (each selected group merged with its smart default). Per-group merge
 * and per-row delete still live inside each MergeGroup for fine control.
 */
export function DuplicatesSection({ groups }: { groups: DuplicateGroup[] }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const keys = React.useMemo(() => groups.map((g) => g.key), [groups]);
  React.useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((k) => keys.includes(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [keys]);

  const allChecked = selected.size > 0 && selected.size === groups.length;
  const someChecked = selected.size > 0 && !allChecked;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === groups.length ? new Set() : new Set(keys)
    );
  }

  async function mergeSelected() {
    setPending(true);
    setError(null);
    const plans = groups
      .filter((g) => selected.has(g.key))
      .map((g) => {
        const { keepId, mergeIds } = defaultMergePlan(g);
        return { primaryId: keepId, dupeIds: mergeIds };
      });
    try {
      const res = await bulkMergeContacts(plans);
      if (res.error) setError(res.error);
      else {
        setSelected(new Set());
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={allChecked ? true : someChecked ? "indeterminate" : false}
            onCheckedChange={toggleAll}
            aria-label="Select all groups"
          />
          <span className="text-muted-foreground">
            {selected.size > 0
              ? `${selected.size} group${selected.size === 1 ? "" : "s"} selected`
              : "Select groups to merge in bulk"}
          </span>
        </label>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
            <ConfirmDialog
              trigger={
                <Button size="sm" disabled={pending}>
                  <Merge className="size-4" />
                  {pending ? "Merging…" : `Merge ${selected.size} groups`}
                </Button>
              }
              title={`Merge ${selected.size} group${
                selected.size === 1 ? "" : "s"
              }?`}
              description="Each selected group keeps its most complete contact and merges the rest into it (activity and deals move onto the kept contact). This can't be undone."
              confirmLabel="Merge all"
              pendingLabel="Merging…"
              onConfirm={mergeSelected}
            />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {groups.map((g) => (
        <div key={g.key} className="flex items-start gap-2">
          <div className="pt-4">
            <Checkbox
              checked={selected.has(g.key)}
              onCheckedChange={() => toggle(g.key)}
              aria-label={`Select group ${g.label} for bulk merge`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <MergeGroup group={g} />
          </div>
        </div>
      ))}
    </div>
  );
}
