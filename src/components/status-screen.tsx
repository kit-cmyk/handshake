import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A full-height, playful screen for 404 / error / crash pages.
 *
 * Purely presentational (no hooks), so it can be rendered from both Server
 * Components (not-found, /error) and Client error boundaries.
 */
export function StatusScreen({
  icon: Icon,
  code,
  title,
  description,
  children,
  wave = false,
  className,
}: {
  icon: LucideIcon;
  /** Big ghosted number/word behind the icon, e.g. "404". */
  code?: string;
  title: string;
  description?: React.ReactNode;
  /** Action buttons. */
  children?: React.ReactNode;
  /** Give the icon a friendly wave instead of a float (nice for handshakes). */
  wave?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[70vh] w-full flex-col items-center justify-center gap-6 px-6 py-16 text-center",
        className,
      )}
    >
      <div className="relative grid place-items-center">
        {code ? (
          <span
            aria-hidden
            className="select-none bg-gradient-to-b from-primary/15 to-primary/0 bg-clip-text text-[7rem] font-extrabold leading-none tracking-tighter text-transparent sm:text-[9rem]"
          >
            {code}
          </span>
        ) : null}
        <span
          className={cn(
            "grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-xl shadow-primary/25",
            code ? "absolute" : "",
            wave ? "animate-hs-wave" : "animate-hs-float",
          )}
        >
          <Icon className="size-8" strokeWidth={2} />
        </span>
      </div>

      <div className="animate-hs-pop space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description ? (
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      {children ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}
