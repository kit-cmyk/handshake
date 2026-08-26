import { cn } from "@/lib/utils";

/**
 * Validation message shown directly beneath the field it belongs to.
 *
 * Pair it with `fieldErrorProps` on the input so the two are linked for screen
 * readers and the field picks up the invalid styling:
 *
 *   <Input id="email" {...fieldErrorProps("email", state.field === "email")} />
 *   <FieldError id="email">{state.field === "email" && state.error}</FieldError>
 */
export function FieldError({
  id,
  className,
  children,
}: {
  /** The field's id — the message gets `<id>-error`, matching aria-describedby. */
  id: string;
  className?: string;
  children?: React.ReactNode;
}) {
  if (!children) return null;
  return (
    <p
      id={`${id}-error`}
      role="alert"
      className={cn("text-sm font-medium text-destructive", className)}
    >
      {children}
    </p>
  );
}

/** Props linking a field to its FieldError. Spread onto the input. */
export function fieldErrorProps(id: string, invalid: boolean | undefined) {
  return invalid
    ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` }
    : {};
}

/**
 * The error to show under `field`, or undefined.
 *
 * Actions tag validation failures with the field they concern. Failures that
 * aren't about one field — a database or network error — arrive untagged, and
 * `fallback` decides which field they surface under (use the form's first or
 * primary input) so no message is ever dropped.
 */
export function errorFor(
  state: { error?: string; field?: string } | undefined,
  field: string,
  fallback?: string
): string | undefined {
  if (!state?.error) return undefined;
  return (state.field ?? fallback) === field ? state.error : undefined;
}
