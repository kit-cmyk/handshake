import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { DESTINATIONS, type NavKey } from "@/lib/nav";

/** Where a back link points: a known destination, or an ad-hoc href + label. */
export type BackTarget = NavKey | { href: string; label: string };

function resolveBack(target: BackTarget) {
  if (typeof target === "string") {
    const d = DESTINATIONS[target];
    return { href: d.href, label: d.backLabel };
  }
  return target;
}

/** The one "← Back to X" link used everywhere in the app. */
export function BackLink({
  to,
  className,
}: {
  to: BackTarget;
  className?: string;
}) {
  const { href, label } = resolveBack(to);
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground",
        className
      )}
    >
      <ArrowLeft className="size-4" /> {label}
    </Link>
  );
}

/**
 * The standard page heading: optional back link, title (with an optional inline
 * badge), description, and right-aligned actions. Every page in the app uses
 * this so headings, spacing, and wrapping behave identically.
 */
export function PageHeader({
  title,
  description,
  back,
  badge,
  actions,
  breadcrumb,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  back?: BackTarget;
  /** Rendered inline, right of the title — e.g. a status or lifecycle badge. */
  badge?: React.ReactNode;
  /** Buttons and menus for this page, right-aligned on wide screens. */
  actions?: React.ReactNode;
  /** Rendered above the back link — e.g. a segment trail on Contacts. */
  breadcrumb?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      {breadcrumb}
      {back && <BackLink to={back} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {badge}
          </div>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}
