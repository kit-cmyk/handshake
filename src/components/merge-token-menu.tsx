"use client";

import * as React from "react";
import { Braces, Check, ChevronDown, Copy } from "lucide-react";
import { MERGE_TOKEN_GROUPS } from "@/lib/email/template";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * The list of shortcodes an email can use, grouped by what they come from —
 * both a reference (every available token, visible in one place) and the way to
 * insert one. `onInsert` receives the bare token name, e.g. "first_name".
 *
 * Two presentations of the same menu: `button` sits next to a field (subject
 * line, campaign step), `toolbar` sits inside the rich editor's toolbar strip.
 *
 * Each row also carries a copy button, for pasting a shortcode somewhere the
 * caret isn't — a different field, another draft, a template kept elsewhere.
 * Copying leaves the menu open so several can be grabbed in one visit.
 */
export function MergeTokenMenu({
  onInsert,
  variant = "button",
  label = "Insert field",
  align = "end",
  className,
}: {
  onInsert: (token: string) => void;
  variant?: "button" | "toolbar";
  label?: string;
  align?: "start" | "end";
  className?: string;
}) {
  const [copied, setCopied] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(`{{${token}}}`);
    } catch {
      return; /* clipboard unavailable */
    }
    setCopied(token);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 1500);
  }

  return (
    <DropdownMenu onOpenChange={(open) => !open && setCopied(null)}>
      <DropdownMenuTrigger asChild>
        {variant === "toolbar" ? (
          <button
            type="button"
            title="Insert shortcode"
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
              className
            )}
          >
            <Braces className="size-4" /> {label}
          </button>
        ) : (
          <Button type="button" variant="outline" size="sm" className={className}>
            {label} <ChevronDown className="size-3" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="max-h-80 overflow-y-auto">
        {MERGE_TOKEN_GROUPS.map((g, gi) => (
          <React.Fragment key={g.group}>
            {gi > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{g.group}</DropdownMenuLabel>
            {g.tokens.map((t) => (
              <DropdownMenuItem
                key={t.token}
                className="pr-1"
                onSelect={() => onInsert(t.token)}
              >
                {t.label}
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {`{{${t.token}}}`}
                </span>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Copy {{${t.token}}}`}
                  title={`Copy {{${t.token}}}`}
                  className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                  onClick={(e) => {
                    // Keep the click off the row so copying neither inserts the
                    // token nor closes the menu.
                    e.preventDefault();
                    e.stopPropagation();
                    copy(t.token);
                  }}
                >
                  {copied === t.token ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </button>
              </DropdownMenuItem>
            ))}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Insert `{{token}}` into a plain text input at the caret, keeping the caret
 * after the inserted token. Returns the next value; the caller owns the state.
 */
export function insertTokenAt(
  input: HTMLInputElement | null,
  value: string,
  token: string
): { value: string; caret: number } {
  const snippet = `{{${token}}}`;
  const start = input?.selectionStart ?? value.length;
  const end = input?.selectionEnd ?? value.length;
  return {
    value: value.slice(0, start) + snippet + value.slice(end),
    caret: start + snippet.length,
  };
}
