"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addContactsToSegment,
  listStaticSegments,
  saveSegment,
} from "@/app/(app)/segments/actions";

const NEW_SEGMENT = "__new";

/**
 * Bulk action: drop the selected contacts into a static segment, or into a new
 * one created on the spot. Dynamic segments aren't offered — their membership
 * comes from their filter, so a hand-added contact would be dropped on the next
 * re-evaluation.
 */
export function AddToSegmentButton({
  ids,
  onDone,
}: {
  ids: string[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [segments, setSegments] = React.useState<
    { id: string; name: string }[] | null
  >(null);
  const [target, setTarget] = React.useState<string>(NEW_SEGMENT);
  const [newName, setNewName] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listStaticSegments().then((rows) => {
      if (cancelled) return;
      setSegments(rows);
      setTarget(rows[0]?.id ?? NEW_SEGMENT);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      let segmentId = target;

      if (target === NEW_SEGMENT) {
        const fd = new FormData();
        fd.set("name", newName.trim());
        fd.set("type", "static");
        // No conditions: membership is exactly the contacts chosen here, and
        // the empty-definition guard keeps a snapshot from replacing them.
        fd.set("definition", JSON.stringify({ match: "all", rules: [] }));
        const created = await saveSegment({}, fd);
        if (created.error || !created.id) {
          setError(created.error ?? "Could not create the segment.");
          return;
        }
        segmentId = created.id;
      }

      const res = await addContactsToSegment(segmentId, ids);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      onDone?.();
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const label = ids.length === 1 ? "contact" : "contacts";
  const disabled =
    pending || (target === NEW_SEGMENT && !newName.trim()) || !ids.length;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          setNewName("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <ListPlus className="size-4" /> Add to segment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Add {ids.length} {label} to a segment
          </DialogTitle>
          <DialogDescription>
            Static segments only — a dynamic segment builds its own membership
            from its filter.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Segment</Label>
            <Select
              value={target}
              onValueChange={setTarget}
              disabled={segments === null}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={segments === null ? "Loading…" : "Choose"}
                />
              </SelectTrigger>
              <SelectContent>
                {(segments ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_SEGMENT}>+ New segment…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {target === NEW_SEGMENT && (
            <div className="space-y-2">
              <Label htmlFor="new-segment-name">New segment name</Label>
              <Input
                id="new-segment-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Booth visitors — March"
              />
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={submit} disabled={disabled}>
            {pending ? "Adding…" : "Add to segment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
