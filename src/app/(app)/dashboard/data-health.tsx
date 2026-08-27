import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { plural } from "@/lib/utils";
import { loadDataHealth } from "./queries";

/**
 * A nudge toward the data-quality page, shown only when there is something to
 * fix. Renders nothing when the book is clean — the dashboard should never
 * carry a row that says "0 problems".
 *
 * This is the cheap sibling of `DataHealthCallout`: that one reports duplicates
 * too, but needs the whole contact book in memory to find them, so it belongs
 * on the screens where an import or a lead search has just run — not on the
 * page that loads every time someone signs in.
 */
export async function DataHealth() {
  const { missingEmail, missingName, total } = await loadDataHealth();
  if (total === 0) return null;

  const parts: string[] = [];
  if (missingEmail > 0)
    parts.push(
      `${missingEmail.toLocaleString()} ${plural("contact", missingEmail)} with no email`
    );
  if (missingName > 0)
    parts.push(
      `${missingName.toLocaleString()} with no name`
    );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Some contacts can&apos;t be reached
          </p>
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {parts.join(" and ")}. They&apos;ll be skipped by every campaign
            until that&apos;s fixed.
          </p>
        </div>
      </div>
      <Link
        href="/contacts/issues"
        className={buttonVariants({ size: "sm" }) + " shrink-0"}
      >
        Review &amp; resolve
      </Link>
    </div>
  );
}
