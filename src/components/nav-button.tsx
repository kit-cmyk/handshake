import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DESTINATIONS, type NavKey } from "@/lib/nav";

/**
 * A button that navigates to another feature. Icon and label come from the nav
 * registry, so "Find leads" (or Import, or Contacts) looks and reads the same
 * from every page that links to it.
 */
export function NavButton({
  to,
  label,
  variant = "outline",
  size,
  className,
}: {
  to: NavKey;
  /** Overrides the registry label — use sparingly, for page-specific phrasing. */
  label?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const { href, label: defaultLabel, icon: Icon } = DESTINATIONS[to];
  return (
    <Button variant={variant} size={size} className={className} asChild>
      <Link href={href}>
        <Icon className="size-4" /> {label ?? defaultLabel}
      </Link>
    </Button>
  );
}
