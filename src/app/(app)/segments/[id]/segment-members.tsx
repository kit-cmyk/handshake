"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, UserMinus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { LifecycleBadge } from "@/components/lifecycle-badge";
import type { LifecycleStage } from "@/lib/types";
import {
  addContactsToSegment,
  removeContactsFromSegment,
  searchContactsForSegment,
  type ContactCandidate,
} from "../actions";

export type MemberRow = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  stage: string;
};

export function SegmentMembers({
  segmentId,
  segmentType,
  members,
  total,
}: {
  segmentId: string;
  segmentType: "static" | "dynamic";
  /** The page's slice of members — capped, see `total`. */
  members: MemberRow[];
  /** Full member count, which can exceed `members.length`. */
  total: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const editable = segmentType === "static";

  function toggle(id: string, on: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function removeSelected() {
    setPending(true);
    setError(null);
    try {
      const res = await removeContactsFromSegment(segmentId, [...selected]);
      if (res.error) {
        setError(res.error);
        return;
      }
      setSelected(new Set());
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (!total) {
    return (
      <div className="rounded-lg border">
        <EmptyState
          bare
          icon={Users}
          title="Nobody in here yet"
          description={
            editable
              ? "Add contacts by hand, or give the segment a filter and refresh its snapshot."
              : "No contact matches this filter right now. Loosen a condition and the segment fills itself."
          }
        >
          {editable && (
            <AddMembersSheet
              segmentId={segmentId}
              trigger={
                <Button>
                  <Plus className="size-4" /> Add contacts
                </Button>
              }
            />
          )}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {selected.size > 0
            ? `${selected.size} selected`
            : `Showing ${members.length} of ${total}`}
        </p>
        <div className="flex items-center gap-2">
          {editable && selected.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={pending}
              onClick={removeSelected}
            >
              <UserMinus className="size-4" />
              {pending ? "Removing…" : `Remove ${selected.size}`}
            </Button>
          )}
          {editable && selected.size === 0 && (
            <AddMembersSheet
              segmentId={segmentId}
              trigger={
                <Button variant="outline" size="sm">
                  <Plus className="size-4" /> Add contacts
                </Button>
              }
            />
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      <div className="rounded-lg border">
        <Table containerClassName="max-h-[60vh]">
          <TableHeader>
            <TableRow>
              {editable && <TableHead className="w-9" />}
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Stage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                {editable && (
                  <TableCell>
                    <Checkbox
                      aria-label={`Select ${m.name}`}
                      checked={selected.has(m.id)}
                      onCheckedChange={(v) => toggle(m.id, !!v)}
                    />
                  </TableCell>
                )}
                <TableCell className="font-medium">
                  <Link
                    href={`/contacts/${m.id}`}
                    className="hover:underline"
                  >
                    {m.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {m.email ?? "—"}
                </TableCell>
                <TableCell>{m.company ?? "—"}</TableCell>
                <TableCell>
                  <LifecycleBadge stage={m.stage as LifecycleStage} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {total > members.length && (
        <p className="text-xs text-muted-foreground">
          Showing the first {members.length} of {total}.{" "}
          <Link
            href={`/contacts?segment=${segmentId}`}
            className="underline underline-offset-2"
          >
            Browse them all on Contacts
          </Link>
          .
        </p>
      )}
    </div>
  );
}

/** Search-and-check picker for adding people to a static segment. */
function AddMembersSheet({
  segmentId,
  trigger,
}: {
  segmentId: string;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<ContactCandidate[]>([]);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [searching, setSearching] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Only the newest search may write results — a slow earlier query would
  // otherwise land last and show matches for text that's no longer typed.
  const seq = React.useRef(0);

  React.useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setSearching(true);
      const rows = await searchContactsForSegment(segmentId, query);
      if (mine !== seq.current) return;
      setResults(rows);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [open, query, segmentId]);

  async function add() {
    setPending(true);
    setError(null);
    try {
      const res = await addContactsToSegment(segmentId, [...picked]);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setPicked(new Set());
      setQuery("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setPicked(new Set());
          setQuery("");
          setError(null);
        }
      }}
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Add contacts to this segment</SheetTitle>
        </SheetHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            autoFocus
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {searching && !results.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Searching…
            </p>
          ) : results.length ? (
            results.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60"
              >
                <Checkbox
                  checked={picked.has(c.id)}
                  onCheckedChange={(v) =>
                    setPicked((s) => {
                      const next = new Set(s);
                      if (v) next.add(c.id);
                      else next.delete(c.id);
                      return next;
                    })
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {c.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.email ?? "No email"}
                    {c.company ? ` · ${c.company}` : ""}
                  </span>
                </span>
              </label>
            ))
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {query
                ? "No contacts match — or everyone who does is already in."
                : "Everyone's already in this segment."}
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between border-t pt-4">
          <Badge variant="secondary">{picked.size} selected</Badge>
          <Button onClick={add} disabled={pending || picked.size === 0}>
            {pending ? "Adding…" : `Add ${picked.size || ""}`.trim()}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
