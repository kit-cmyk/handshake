"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  resolveContactFields,
  deleteContacts,
  skipContactIssues,
  skipContactIssuesBulk,
} from "./actions";
import {
  EMAIL_RE,
  FORMATTING_LABELS,
  type FormattingIssue,
  type FormattingIssueType,
} from "@/lib/data-quality";
import { contactName } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Which contact field a given issue type maps to. */
type FieldKind = "name" | "email" | "phone";
const FIELD_OF: Record<FormattingIssueType, FieldKind> = {
  missing_name: "name",
  missing_email: "email",
  invalid_email: "email",
  missing_phone: "phone",
  invalid_phone: "phone",
};

/**
 * A single issue type's worth of contacts. `reason` scopes every row to just
 * the one field that's broken, so the list stays focused inside its accordion.
 */
export function FixList({
  reason,
  items,
}: {
  reason: FormattingIssueType;
  items: FormattingIssue[];
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [deleting, setDeleting] = React.useState(false);
  const [skipping, setSkipping] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Skippable issues can be accepted as-is: any missing field, plus an "invalid"
  // (heuristically short) phone, since real numbers vary (extensions, short
  // codes, intl). Invalid emails still must be corrected.
  const canSkip = reason.startsWith("missing_") || reason === "invalid_phone";
  const label = FORMATTING_LABELS[reason];

  const ids = React.useMemo(() => items.map((i) => i.contact.id), [items]);
  // When the item set changes (e.g. after a refresh drops resolved rows), prune
  // selections for rows that no longer exist. Adjusting state during render is
  // React's recommended alternative to a setState-in-effect here.
  const [seenIds, setSeenIds] = React.useState(ids);
  if (seenIds !== ids) {
    setSeenIds(ids);
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ids.includes(id)));
      return next.size === prev.size ? prev : next;
    });
  }

  const allChecked = selected.size > 0 && selected.size === items.length;
  const someChecked = selected.size > 0 && !allChecked;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === items.length ? new Set() : new Set(ids)
    );
  }

  async function removeSelected() {
    setDeleting(true);
    setError(null);
    try {
      const res = await deleteContacts([...selected]);
      if (res.error) setError(res.error);
      else {
        setSelected(new Set());
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  async function skipMany(targetIds: string[]) {
    setSkipping(true);
    setError(null);
    try {
      const res = await skipContactIssuesBulk(targetIds, [reason]);
      if (res.error) setError(res.error);
      else {
        setSelected(new Set());
        router.refresh();
      }
    } finally {
      setSkipping(false);
    }
  }

  return (
    <div className="space-y-2">
      {(selected.size > 0 || canSkip) && (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
          <span className="font-medium">
            {selected.size > 0
              ? `${selected.size} selected`
              : `${items.length} contact${items.length === 1 ? "" : "s"}`}
          </span>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            )}
            {canSkip && selected.size > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={skipping || deleting}
                onClick={() => skipMany([...selected])}
              >
                <Check className="size-4" />
                {skipping ? "Skipping…" : `Skip ${selected.size}`}
              </Button>
            )}
            {canSkip && selected.size === 0 && (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" size="sm" disabled={skipping}>
                    <Check className="size-4" />
                    {skipping ? "Skipping…" : `Skip all ${items.length}`}
                  </Button>
                }
                title={`Skip “${label}” for ${items.length} contact${
                  items.length === 1 ? "" : "s"
                }?`}
                description={`They'll stop appearing under this issue. Nothing about the contacts changes — you're only dismissing the ${label.toLowerCase()} flag.`}
                confirmLabel="Skip all"
                pendingLabel="Skipping…"
                onConfirm={() => skipMany(ids)}
              />
            )}
            {selected.size > 0 && (
              <ConfirmDialog
                trigger={
                  <Button variant="destructive" size="sm" disabled={deleting}>
                    <Trash2 className="size-4" />
                    {deleting ? "Deleting…" : `Delete ${selected.size}`}
                  </Button>
                }
                title={`Delete ${selected.size} contact${
                  selected.size === 1 ? "" : "s"
                }?`}
                description="These contact records will be permanently removed. Their activity is detached or removed per your data rules. This can't be undone."
                confirmLabel="Delete"
                pendingLabel="Deleting…"
                onConfirm={removeSelected}
              />
            )}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[1%]">
                <Checkbox
                  checked={
                    allChecked ? true : someChecked ? "indeterminate" : false
                  }
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="w-[30%]">Contact</TableHead>
              <TableHead>Fix</TableHead>
              <TableHead className="w-[1%]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <FixRow
                key={item.contact.id}
                reason={reason}
                item={item}
                selected={selected.has(item.contact.id)}
                onToggle={() => toggle(item.contact.id)}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function digits(s: string): string {
  return s.replace(/\D/g, "");
}

const invalidCls =
  "border-destructive text-destructive focus-visible:ring-destructive";

function FixRow({
  reason,
  item,
  selected,
  onToggle,
}: {
  reason: FormattingIssueType;
  item: FormattingIssue;
  selected: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const { contact } = item;
  const field = FIELD_OF[reason];
  // Missing fields and a flagged phone can be kept as-is via Skip.
  const skippable = reason.startsWith("missing_") || reason === "invalid_phone";

  const [first, setFirst] = React.useState(contact.first_name ?? "");
  const [last, setLast] = React.useState(contact.last_name ?? "");
  const [email, setEmail] = React.useState(contact.email ?? "");
  const [phone, setPhone] = React.useState(contact.phone ?? "");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const emailInvalid =
    field === "email" && email.trim() !== "" && !EMAIL_RE.test(email.trim());
  const phoneInvalid =
    field === "phone" && phone.trim() !== "" && digits(phone).length < 7;

  const changed =
    field === "name"
      ? first.trim() !== (contact.first_name ?? "") ||
        last.trim() !== (contact.last_name ?? "")
      : field === "email"
        ? email.trim() !== (contact.email ?? "")
        : phone.trim() !== (contact.phone ?? "");

  // A short phone no longer blocks saving — it's a soft hint, not an error.
  const canSave = changed && !emailInvalid && !pending;

  async function save() {
    if (!canSave) return;
    setPending(true);
    setError(null);
    const patch: Record<string, string> = {};
    if (field === "name") {
      patch.first_name = first;
      patch.last_name = last;
    } else if (field === "email") {
      patch.email = email;
    } else {
      patch.phone = phone;
    }
    try {
      const res = await resolveContactFields(contact.id, patch);
      if (res.error) setError(res.error);
      else router.refresh(); // row drops out once the issue clears
    } finally {
      setPending(false);
    }
  }

  async function skip() {
    setPending(true);
    setError(null);
    try {
      const res = await skipContactIssues(contact.id, [reason]);
      if (res.error) setError(res.error);
      else router.refresh();
    } finally {
      setPending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  }

  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell className="align-top">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${contactName(contact)}`}
        />
      </TableCell>

      <TableCell className="align-top">
        <Link
          href={`/contacts/${contact.id}`}
          className="font-medium hover:underline"
        >
          {contactName(contact)}
        </Link>
        {contact.email && field !== "email" && (
          <div className="truncate text-xs text-muted-foreground">
            {contact.email}
          </div>
        )}
      </TableCell>

      <TableCell>
        <div className="flex flex-wrap items-start gap-2" onKeyDown={onKeyDown}>
          {field === "name" && (
            <>
              <Input
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                placeholder="First name"
                className="h-8 w-32"
              />
              <Input
                value={last}
                onChange={(e) => setLast(e.target.value)}
                placeholder="Last name"
                className="h-8 w-32"
              />
            </>
          )}
          {field === "email" && (
            <div className="space-y-0.5">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                aria-invalid={emailInvalid}
                className={cn("h-8 w-64", emailInvalid && invalidCls)}
              />
              {emailInvalid && <FieldError>Invalid email format</FieldError>}
            </div>
          )}
          {field === "phone" && (
            <div className="space-y-0.5">
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 555 5555"
                className="h-8 w-48"
              />
              {phoneInvalid && (
                <p className="text-[11px] text-muted-foreground">
                  Looks short — save anyway if it&apos;s correct, or skip.
                </p>
              )}
            </div>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </TableCell>

      <TableCell className="align-top">
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" onClick={save} disabled={!canSave}>
            <Check className="size-4" />
            {pending ? "Saving…" : "Save"}
          </Button>
          {skippable && (
            <Button
              variant="ghost"
              size="sm"
              onClick={skip}
              disabled={pending}
              title="Accept this contact as-is and stop flagging it"
            >
              Skip
            </Button>
          )}
          <Button asChild variant="ghost" size="icon" title="Open full profile">
            <Link href={`/contacts/${contact.id}`}>
              <ExternalLink className="size-4" />
            </Link>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 text-[11px] text-destructive">
      <AlertTriangle className="size-3" />
      {children}
    </div>
  );
}
