"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldError } from "@/components/ui/field-error";
import { statusLabel } from "@/lib/utils";
import {
  SEGMENT_FIELD_GROUPS,
  OPERATORS_FOR_KIND,
  OPERATOR_LABELS,
  VALUELESS_OPS,
  MULTI_VALUE_OPS,
  DAY_COUNT_OPS,
  DATE_OPS,
  fieldDef,
  ruleErrors,
  type Operator,
  type Rule,
} from "@/lib/segments";

/** What kind of value an operator takes, for deciding whether one survives an operator change. */
function valueShape(op: Operator): "none" | "set" | "days" | "date" | "text" {
  if (VALUELESS_OPS.includes(op)) return "none";
  if (MULTI_VALUE_OPS.includes(op)) return "set";
  if (DAY_COUNT_OPS.includes(op)) return "days";
  if (DATE_OPS.includes(op)) return "date";
  return "text";
}

/**
 * One condition row of a segment/branch filter: field → operator → value.
 *
 * Shared by the segment builder and the workflow branch node so a new field
 * kind or operator lands in both at once — the two drifted apart before, and a
 * multi-value or date operator added on one side evaluated fine but had no
 * editor on the other.
 */
export function SegmentRuleFields({
  rule,
  onChange,
  showErrors = false,
  /** Unique within the form — used to tie inputs to their error message. */
  idPrefix,
  /** "row" puts the three controls on one line; "stack" is for narrow panels. */
  layout = "row",
}: {
  rule: Rule;
  onChange: (patch: Partial<Rule>) => void;
  showErrors?: boolean;
  idPrefix: string;
  layout?: "row" | "stack";
}) {
  const def = fieldDef(rule.field);
  const kind = def?.kind ?? "text";
  const errors = showErrors ? ruleErrors(rule) : [];
  const stacked = layout === "stack";
  const controlWidth = stacked ? "w-full" : "w-44";

  function onFieldChange(field: string) {
    const nextKind = fieldDef(field)?.kind ?? "text";
    const nextOp = OPERATORS_FOR_KIND[nextKind][0];
    // A field change resets the value: "is any of [new, won]" makes no sense
    // carried over to a text field, and a day count makes none on an enum.
    onChange({ field, op: nextOp, value: "", values: undefined });
  }

  function onOpChange(next: Operator) {
    const wasMulti = MULTI_VALUE_OPS.includes(rule.op);
    const isMulti = MULTI_VALUE_OPS.includes(next);
    // Keep the typed value only when the new operator takes the same kind of
    // value — a day count means nothing to "is before", and vice versa.
    const sameValueShape = valueShape(rule.op) === valueShape(next);
    return onChange({
      op: next,
      value: isMulti || VALUELESS_OPS.includes(next)
        ? undefined
        : sameValueShape
          ? (rule.value ?? "")
          : "",
      values: isMulti ? (wasMulti ? (rule.values ?? []) : []) : undefined,
    });
  }

  return (
    <div className={stacked ? "space-y-2" : "flex flex-1 flex-wrap items-center gap-2"}>
      <Select value={rule.field} onValueChange={onFieldChange}>
        <SelectTrigger className={controlWidth}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SEGMENT_FIELD_GROUPS.map((g) => (
            <SelectGroup key={g.group}>
              <SelectLabel>{g.group}</SelectLabel>
              {g.fields.map((f) => (
                <SelectItem key={f.key} value={f.key}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      <Select value={rule.op} onValueChange={(v) => onOpChange(v as Operator)}>
        <SelectTrigger className={controlWidth}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPERATORS_FOR_KIND[kind].map((op) => (
            <SelectItem key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <RuleValueInput
        rule={rule}
        onChange={onChange}
        className={controlWidth}
        invalid={errors.length > 0}
        id={idPrefix}
      />

      {errors.length > 0 && (
        <div className={stacked ? undefined : "w-full"}>
          <FieldError id={idPrefix}>{errors[0]}</FieldError>
        </div>
      )}
    </div>
  );
}

function RuleValueInput({
  rule,
  onChange,
  className,
  invalid,
  id,
}: {
  rule: Rule;
  onChange: (patch: Partial<Rule>) => void;
  className?: string;
  invalid?: boolean;
  id: string;
}) {
  const def = fieldDef(rule.field);

  if (VALUELESS_OPS.includes(rule.op)) return null;

  if (MULTI_VALUE_OPS.includes(rule.op)) {
    const selected = new Set(rule.values ?? []);
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border px-3 py-2">
        {(def?.options ?? []).map((o) => (
          <label
            key={o}
            className="flex cursor-pointer items-center gap-1.5 text-sm"
          >
            <Checkbox
              checked={selected.has(o)}
              onCheckedChange={(checked) => {
                const next = new Set(selected);
                if (checked) next.add(o);
                else next.delete(o);
                onChange({ values: [...next] });
              }}
            />
            {statusLabel(o)}
          </label>
        ))}
      </div>
    );
  }

  if (DAY_COUNT_OPS.includes(rule.op)) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          min={1}
          step={1}
          className="w-20"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
          value={rule.value ?? ""}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="30"
        />
        <span className="text-sm text-muted-foreground">days</span>
      </div>
    );
  }

  if (DATE_OPS.includes(rule.op)) {
    return (
      <DatePicker
        className={className}
        value={rule.value ?? ""}
        onChange={(v) => onChange({ value: v })}
      />
    );
  }

  if (def?.kind === "enum") {
    return (
      <Select
        value={rule.value ?? ""}
        onValueChange={(v) => onChange({ value: v })}
      >
        <SelectTrigger className={className} aria-invalid={invalid || undefined}>
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {(def.options ?? []).map((o) => (
            <SelectItem key={o} value={o}>
              {statusLabel(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      className={className}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${id}-error` : undefined}
      value={rule.value ?? ""}
      onChange={(e) => onChange({ value: e.target.value })}
      placeholder="value"
    />
  );
}
