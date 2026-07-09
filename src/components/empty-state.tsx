import * as React from "react";
import { Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

/**
 * A friendly, animated empty state.
 *
 * Wrap it in a dashed Card by default, or pass `bare` to drop the card
 * (e.g. inside a table cell or an existing Card).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  bare = false,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  /** Action buttons / CTAs. */
  children?: React.ReactNode;
  bare?: boolean;
  className?: string;
}) {
  const body = (
    <div
      className={cn(
        "flex flex-col items-center gap-4 px-6 py-16 text-center",
        className,
      )}
    >
      <EmptyIllustration icon={Icon} />
      <div className="space-y-1.5">
        <p className="text-base font-semibold tracking-tight">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children ? (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {children}
        </div>
      ) : null}
    </div>
  );

  if (bare) return body;
  return <Card className="border-dashed bg-card/50 shadow-none">{body}</Card>;
}

function EmptyIllustration({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="relative grid size-20 shrink-0 place-items-center">
      {/* radiating rings */}
      <span className="absolute inset-0 rounded-full bg-primary/5 animate-hs-ping" />
      <span className="absolute inset-2 rounded-full bg-primary/10" />
      {/* the badge */}
      <span className="animate-hs-float relative grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/25">
        <Icon className="size-7" strokeWidth={2} />
      </span>
      {/* a little sparkle */}
      <Sparkles className="animate-hs-twinkle absolute -right-1 -top-1 size-4 text-primary" />
    </div>
  );
}
