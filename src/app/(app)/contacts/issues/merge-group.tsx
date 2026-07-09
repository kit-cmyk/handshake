"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Merge, ArrowRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { mergeContacts, deleteContacts } from "./actions";
import { defaultKeepId } from "./merge-utils";
import { contactName, type ContactWithCompany } from "@/lib/types";
import { type DuplicateGroup } from "@/lib/data-quality";
import { cn } from "@/lib/utils";

type Mode = "keep" | "merge" | "skip";

export function MergeGroup({ group }: { group: DuplicateGroup }) {
  const router = useRouter();

  // Default: keep the most complete record, merge the rest.
  const defaultKeep = React.useMemo(() => defaultKeepId(group), [group]);

  const [modes, setModes] = React.useState<Record<string, Mode>>(() =>
    Object.fromEntries(
      group.contacts.map((c) => [c.id, c.id === defaultKeep ? "keep" : "merge"])
    )
  );
  // Row-level selection for outright deletion (independent of the merge plan).
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const keepId = Object.keys(modes).find((id) => modes[id] === "keep")!;
  const mergeIds = group.contacts
    .filter((c) => modes[c.id] === "merge")
    .map((c) => c.id);

  function setKeep(id: string) {
    setModes((prev) => {
      const next: Record<string, Mode> = { ...prev };
      for (const k of Object.keys(next))
        if (next[k] === "keep") next[k] = "merge";
      next[id] = "keep";
      return next;
    });
  }

  function setMode(id: string, mode: Mode) {
    if (mode === "keep") return setKeep(id);
    setModes((prev) => ({ ...prev, [id]: mode }));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Preview the survivor: start from the kept contact, backfill each empty
  // field from the first merged donor that has a value.
  const keep = group.contacts.find((c) => c.id === keepId)!;
  const donors = group.contacts.filter((c) => mergeIds.includes(c.id));
  function resolved(get: (c: ContactWithCompany) => string | null | undefined) {
    const own = get(keep);
    if (own) return { value: own, fromMerge: false };
    const donor = donors.find((d) => get(d));
    if (donor) return { value: get(donor)!, fromMerge: true };
    return { value: null, fromMerge: false };
  }
  const previewName = (() => {
    const first = resolved((c) => c.first_name);
    const last = resolved((c) => c.last_name);
    const name = [first.value, last.value].filter(Boolean).join(" ").trim();
    return { value: name || null, fromMerge: first.fromMerge || last.fromMerge };
  })();
  const previewEmail = resolved((c) => c.email);
  const previewPhone = resolved((c) => c.phone);
  const previewCompany = resolved((c) => c.companies?.name);

  async function doMerge() {
    setPending(true);
    setError(null);
    try {
      const res = await mergeContacts(keepId, mergeIds);
      if (res.error) setError(res.error);
      else router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function doDelete() {
    setPending(true);
    setError(null);
    try {
      const res = await deleteContacts([...selected]);
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
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium">{group.label}</span>{" "}
          <span className="text-muted-foreground">
            · {group.contacts.length} contacts
          </span>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <ConfirmDialog
              trigger={
                <Button variant="destructive" size="sm" disabled={pending}>
                  <Trash2 className="size-4" /> Delete {selected.size}
                </Button>
              }
              title={`Delete ${selected.size} contact${
                selected.size === 1 ? "" : "s"
              }?`}
              description="The selected contacts are permanently removed (not merged). Their activity is detached or removed per your data rules. This can't be undone."
              confirmLabel="Delete"
              pendingLabel="Deleting…"
              onConfirm={doDelete}
            />
          )}
          <ConfirmDialog
            trigger={
              <Button size="sm" disabled={pending || mergeIds.length === 0}>
                <Merge className="size-4" />
                {pending ? "Merging…" : `Merge ${mergeIds.length} into kept`}
              </Button>
            }
            title={`Merge ${mergeIds.length} contact${
              mergeIds.length === 1 ? "" : "s"
            } into ${contactName(keep)}?`}
            description="The merged contacts will be deleted and their activity and deals moved onto the one you kept. Empty fields on the kept contact are filled in from the merged ones. This can't be undone."
            confirmLabel="Merge"
            pendingLabel="Merging…"
            onConfirm={doMerge}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        {group.contacts.map((c) => {
          const mode = modes[c.id];
          return (
            <div
              key={c.id}
              className={cn(
                "flex items-center gap-3 rounded-md border px-3 py-2 text-sm",
                mode === "keep" && "border-primary/50 bg-primary/5",
                mode === "skip" && "opacity-50",
                selected.has(c.id) && "ring-1 ring-destructive/40"
              )}
            >
              <Checkbox
                checked={selected.has(c.id)}
                onCheckedChange={() => toggleSelect(c.id)}
                aria-label={`Select ${contactName(c)} for deletion`}
              />
              <ModeToggle value={mode} onChange={(m) => setMode(c.id, m)} />
              <Link
                href={`/contacts/${c.id}`}
                className="flex-1 truncate font-medium hover:underline"
              >
                {contactName(c)}
              </Link>
              <span className="hidden w-48 truncate text-muted-foreground sm:block">
                {c.email ?? "—"}
              </span>
              <span className="hidden w-32 truncate text-muted-foreground md:block">
                {c.companies?.name ?? "—"}
              </span>
              <span className="hidden text-xs text-muted-foreground lg:block">
                {new Date(c.created_at).toLocaleDateString()}
              </span>
            </div>
          );
        })}
      </div>

      {mergeIds.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-muted/50 px-3 py-2 text-xs">
          <span className="flex items-center gap-1 font-medium text-muted-foreground">
            <ArrowRight className="size-3.5" /> Result
          </span>
          <PreviewField label="Name" {...previewName} />
          <PreviewField label="Email" {...previewEmail} />
          <PreviewField label="Phone" {...previewPhone} />
          <PreviewField label="Company" {...previewCompany} />
        </div>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function ModeToggle({
  value,
  onChange,
}: {
  value: Mode;
  onChange: (m: Mode) => void;
}) {
  const opts: { m: Mode; label: string }[] = [
    { m: "keep", label: "Keep" },
    { m: "merge", label: "Merge" },
    { m: "skip", label: "Skip" },
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-md border">
      {opts.map((o, i) => (
        <button
          key={o.m}
          type="button"
          onClick={() => onChange(o.m)}
          className={cn(
            "px-2 py-0.5 text-xs transition-colors",
            i > 0 && "border-l",
            value === o.m
              ? o.m === "keep"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary font-medium text-secondary-foreground"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PreviewField({
  label,
  value,
  fromMerge,
}: {
  label: string;
  value: string | null;
  fromMerge: boolean;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-muted-foreground">{label}:</span>
      <span
        className={cn(
          "truncate",
          value ? "font-medium" : "text-muted-foreground",
          fromMerge && "text-primary"
        )}
        title={fromMerge ? "Filled in from a merged contact" : undefined}
      >
        {value ?? "—"}
        {fromMerge && " *"}
      </span>
    </span>
  );
}
