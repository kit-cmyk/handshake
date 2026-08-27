import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      /** `pill` is for counts and other numeric chips; labels stay rounded-md. */
      shape: {
        default: "rounded-md",
        pill: "rounded-full",
      },
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        success:
          "border-transparent bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
        warning:
          "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
        destructive:
          "border-transparent bg-destructive/10 text-destructive dark:text-red-300",
      },
    },
    defaultVariants: { variant: "default", shape: "default" },
  }
);

export function Badge({
  className,
  variant,
  shape,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      className={cn(badgeVariants({ variant, shape }), className)}
      {...props}
    />
  );
}

/**
 * The count chip that sits beside a section heading or tab label. One component
 * so every count in the app reads the same, rather than a hand-rolled pill per
 * surface.
 */
export function CountBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return (
    <Badge
      variant="secondary"
      shape="pill"
      className={cn("min-w-5 justify-center px-1.5 font-semibold", className)}
    >
      {count}
    </Badge>
  );
}

export { badgeVariants };
