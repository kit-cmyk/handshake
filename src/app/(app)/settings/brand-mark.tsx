"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Distinct per-integration glyph for the integration cards. We can't ship the
// real vendor logos (Slack, HubSpot, Salesforce, QuickBooks, etc. are trademarks
// their owners have kept out of third-party icon sets), so each integration gets
// a brand-colored monogram — enough to tell them apart at a glance, unlike the
// old shared database icon.
//
// Drop-in upgrade: add a licensed logo at `public/integrations/<type>.svg` and
// list its `type` in BRAND_ICON_TYPES; the card renders the real SVG instead,
// falling back to the monogram if the file is missing.

/** Integration types with a real logo asset in public/integrations/<type>.svg. */
export const BRAND_ICON_TYPES = new Set<string>([
  "slack",
  "hubspot",
  "pipedrive",
  "quickbooks",
]);

export function BrandGlyph({
  type,
  label,
  className,
}: {
  type: string;
  label: string;
  className?: string;
}) {
  const hasAsset = BRAND_ICON_TYPES.has(type);
  const [failed, setFailed] = React.useState(false);
  const monogram = label.trim().charAt(0).toUpperCase() || "?";

  if (hasAsset && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/integrations/${type}.svg`}
        alt=""
        aria-hidden
        className={cn("h-5 w-auto max-w-full object-contain", className)}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn("text-sm font-bold leading-none", className)}
    >
      {monogram}
    </span>
  );
}
