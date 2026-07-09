"use client";

import * as React from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export type CheckedState = boolean | "indeterminate";

export interface CheckboxProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "onChange" | "checked"
  > {
  checked?: CheckedState;
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, checked = false, onCheckedChange, ...props }, ref) => {
    const state =
      checked === "indeterminate"
        ? "indeterminate"
        : checked
          ? "checked"
          : "unchecked";
    return (
      <button
        ref={ref}
        type="button"
        role="checkbox"
        aria-checked={checked === "indeterminate" ? "mixed" : checked}
        data-state={state}
        onClick={() => onCheckedChange?.(checked !== true)}
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded border border-input shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
          className,
        )}
        {...props}
      >
        {checked === "indeterminate" ? (
          <Minus className="size-3" strokeWidth={3} />
        ) : checked ? (
          <Check className="size-3" strokeWidth={3} />
        ) : null}
      </button>
    );
  },
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
