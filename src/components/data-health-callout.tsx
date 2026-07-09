import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { ContactIssueSummary } from "@/lib/data-quality";

/**
 * Post-ingest data-health prompt. Drop it wherever new contact data arrives —
 * CSV uploads today, Google Places / integration syncs later. Renders nothing
 * when there are no issues.
 */
export function DataHealthCallout({
  summary,
  href = "/contacts/issues",
}: {
  summary: ContactIssueSummary | null | undefined;
  href?: string;
}) {
  if (!summary || summary.total === 0) return null;

  const parts: string[] = [];
  if (summary.duplicateContacts > 0)
    parts.push(`${summary.duplicateContacts} possible duplicate contacts`);
  if (summary.invalid > 0)
    parts.push(`${summary.invalid} with formatting issues`);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Data quality check
          </p>
          <p className="text-sm text-amber-800 dark:text-amber-300">
            We found {parts.join(" and ")} in your contacts. Resolve them before
            you reach out.
          </p>
        </div>
      </div>
      <Link
        href={href}
        className={buttonVariants({ size: "sm" }) + " shrink-0"}
      >
        Review &amp; resolve
      </Link>
    </div>
  );
}
