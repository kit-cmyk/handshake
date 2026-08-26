"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type CopyLists = { cc: string; bcc: string };

/**
 * Cc / Bcc for an outbound email. Both stay hidden behind a toggle until
 * they're wanted — copying people in is the exception, and an always-visible
 * pair of empty fields makes every send look like a broadcast. A list that
 * arrives pre-filled (a reply carrying the thread's Cc forward) opens expanded
 * so it's never sent invisibly.
 */
export function CopyFields({
  value,
  onChange,
}: {
  value: CopyLists;
  onChange: (next: CopyLists) => void;
}) {
  const [showCc, setShowCc] = React.useState(!!value.cc);
  const [showBcc, setShowBcc] = React.useState(!!value.bcc);

  return (
    <div className="space-y-2">
      <input type="hidden" name="cc" value={value.cc} />
      <input type="hidden" name="bcc" value={value.bcc} />

      {(!showCc || !showBcc) && (
        <div className="flex gap-2 text-xs">
          {!showCc && (
            <ToggleLink onClick={() => setShowCc(true)}>Add Cc</ToggleLink>
          )}
          {!showBcc && (
            <ToggleLink onClick={() => setShowBcc(true)}>Add Bcc</ToggleLink>
          )}
        </div>
      )}

      {showCc && (
        <Field
          id="copy-cc"
          label="Cc"
          value={value.cc}
          onChange={(cc) => onChange({ ...value, cc })}
          onClear={() => {
            onChange({ ...value, cc: "" });
            setShowCc(false);
          }}
        />
      )}
      {showBcc && (
        <Field
          id="copy-bcc"
          label="Bcc"
          value={value.bcc}
          onChange={(bcc) => onChange({ ...value, bcc })}
          onClear={() => {
            onChange({ ...value, bcc: "" });
            setShowBcc(false);
          }}
        />
      )}
    </div>
  );
}

function ToggleLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      {children}
    </button>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  onClear,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="w-8 shrink-0 text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="name@company.com, another@company.com"
        className="h-8 flex-1 text-sm"
      />
      <button
        type="button"
        onClick={onClear}
        className="shrink-0 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Remove
      </button>
    </div>
  );
}
