import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Per-integration brand marks for the integration cards and the landing page.
 *
 * These are inlined as components rather than loaded from
 * `public/integrations/<type>.svg` for one reason: monochrome marks have to
 * follow their surroundings. Pipedrive's mark is near-black, so through an
 * `<img>` it disappeared on the dark landing panel and in dark mode. Inline it
 * can paint with `currentColor` and inherit the chip's text colour, which is
 * chosen to be legible wherever the chip is used.
 *
 * Polychrome marks (HubSpot, Salesforce, Zoho, QuickBooks, Slack) keep their
 * own brand colours — each is legible on a light and a dark ground already.
 *
 * Integrations with no mark here fall back to a brand-coloured monogram, which
 * is still enough to tell them apart at a glance.
 *
 * Vendor logos are used nominatively, to name the product each card connects
 * to. Adding one: write a `Mark` and register it in `MARKS`; the `box` class
 * optically sizes it against the square marks, which sit at `size-5`.
 */

type MarkProps = { className?: string };

type Mark = {
  /** Renders the mark itself; `className` carries the sizing. */
  render: (props: MarkProps) => React.ReactElement;
  /** Sizing for this mark's aspect ratio. Defaults to a square `size-5`. */
  box?: string;
};

const MARKS: Record<string, Mark> = {
  hubspot: {
    box: "h-5 w-auto",
    render: ({ className }) => (
      <svg
        viewBox="0 0 22 26"
        fill="none"
        aria-hidden
        className={className}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          fill="#FF4800"
          d="M16.7903 6.70348V9.37375H16.7861C19.2319 9.74741 21.1857 11.5833 21.6869 13.9788C22.1881 16.3743 21.1313 18.8255 19.0361 20.1274C16.9409 21.4293 14.2479 21.308 12.2811 19.8232L10.082 21.9968C10.1389 22.1732 10.1692 22.3569 10.1718 22.542C10.1718 23.5954 9.30785 24.4493 8.24211 24.4493C7.17637 24.4493 6.31241 23.5954 6.31241 22.542C6.31241 21.4886 7.17637 20.6346 8.24211 20.6346C8.42937 20.6373 8.6152 20.6672 8.79365 20.7234L11.0167 18.5262C9.61509 16.5553 9.57888 13.9368 10.9254 11.9289L3.62067 6.30814C2.64054 6.8642 1.39957 6.65902 0.655894 5.81796C-0.087788 4.9769 -0.127341 3.73389 0.561399 2.8483C1.25014 1.96271 2.47561 1.68086 3.48915 2.17493C4.50268 2.66901 5.02239 3.80159 4.73077 4.88077L12.1604 10.6C12.9709 9.95579 13.9392 9.53468 14.9673 9.3793V6.70348C14.2374 6.36653 13.7695 5.64372 13.7659 4.84747V4.78505C13.769 3.65019 14.699 2.73096 15.8472 2.72791H15.9104C17.0585 2.73096 17.9885 3.65019 17.9916 4.78505V4.84747C17.9881 5.64372 17.5202 6.36653 16.7903 6.70348ZM12.8396 15.1587C12.8368 16.8188 14.1956 18.1672 15.8752 18.1711L15.8822 18.1725C17.5626 18.1725 18.9248 16.826 18.9248 15.1651C18.9256 13.5049 17.5652 12.1582 15.8855 12.1564C14.2059 12.1546 12.8425 13.4985 12.8396 15.1587Z"
        />
      </svg>
    ),
  },

  // Monochrome by design — paints with the chip's text colour so it stays
  // legible on the dark landing panel and in dark mode.
  pipedrive: {
    render: ({ className }) => (
      <svg
        viewBox="0 0 304 304"
        aria-hidden
        className={className}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fill="currentColor"
          transform="translate(67 44)"
          d="M59.6807,81.1772 C59.6807,101.5343 70.0078,123.4949 92.7336,123.4949 C109.5872,123.4949 126.6277,110.3374 126.6277,80.8785 C126.6277,55.0508 113.232,37.7119 93.2944,37.7119 C77.0483,37.7119 59.6807,49.1244 59.6807,81.1772 Z M101.3006,0 C142.0482,0 169.4469,32.2728 169.4469,80.3126 C169.4469,127.5978 140.584,160.60942 99.3224,160.60942 C79.6495,160.60942 67.0483,152.1836 60.4595,146.0843 C60.5063,147.5305 60.5374,149.1497 60.5374,150.8788 L60.5374,215 L18.32565,215 L18.32565,44.157 C18.32565,41.6732 17.53126,40.8873 15.07021,40.8873 L0.5531,40.8873 L0.5531,3.4741 L35.9736,3.4741 C52.282,3.4741 56.4564,11.7741 57.2508,18.1721 C63.8708,10.7524 77.5935,0 101.3006,0 Z"
        />
      </svg>
    ),
  },

  // The cloud is wide, so it sits a step shorter than the square marks to keep
  // the row optically even.
  salesforce: {
    box: "h-[1.05rem] w-auto max-w-full",
    render: ({ className }) => (
      <svg
        viewBox="0 0 24 16.6"
        aria-hidden
        className={className}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fill="#00A1E0"
          transform="translate(0 -3.9)"
          d="M10.006 5.415a4.195 4.195 0 0 1 3.045-1.306c1.56 0 2.954.9 3.689 2.205.63-.3 1.35-.45 2.1-.45 2.849 0 5.16 2.34 5.16 5.221 0 2.88-2.311 5.22-5.16 5.22-.345 0-.69-.035-1.02-.104a3.75 3.75 0 0 1-3.3 1.95c-.6 0-1.155-.15-1.65-.375A4.314 4.314 0 0 1 8.88 20.4a4.302 4.302 0 0 1-4.05-2.82c-.27.06-.54.09-.83.09A3.99 3.99 0 0 1 0 13.665c0-1.5.809-2.805 2.024-3.51a4.652 4.652 0 0 1-.39-1.874c0-2.58 2.1-4.665 4.68-4.665 1.53 0 2.879.72 3.72 1.83"
        />
      </svg>
    ),
  },

  zoho: {
    box: "h-6 w-auto max-w-full",
    render: ({ className }) => (
      <svg
        viewBox="0 0 120 120"
        fill="none"
        stroke="#0E8FD4"
        strokeWidth={11}
        strokeLinecap="round"
        aria-hidden
        className={className}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M46 26a34 34 0 1 0 0 68" />
        <path d="M74 94a34 34 0 1 0 0-68" />
        <g transform="rotate(-45 60 60)">
          <path d="M64 48H43a12 12 0 0 0 0 24h21" />
          <path d="M56 72h21a12 12 0 0 0 0-24H56" />
        </g>
      </svg>
    ),
  },

  quickbooks: {
    render: ({ className }) => (
      <svg
        viewBox="0 0 100 100"
        aria-hidden
        className={className}
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="50" cy="50" r="50" fill="#2CA01C" />
        <g fill="none" stroke="#fff" strokeWidth={8.5} strokeLinecap="round">
          <circle cx="32" cy="52" r="12.5" />
          <path d="M44.5 52v22" />
          <circle cx="68" cy="52" r="12.5" />
          <path d="M55.5 52V30" />
        </g>
      </svg>
    ),
  },

  slack: {
    render: ({ className }) => (
      <svg
        viewBox="70 70 130 130"
        aria-hidden
        className={className}
        xmlns="http://www.w3.org/2000/svg"
      >
        <g fill="#E01E5A">
          <path d="M99.4,151.2c0,7.1-5.8,12.9-12.9,12.9c-7.1,0-12.9-5.8-12.9-12.9c0-7.1,5.8-12.9,12.9-12.9h12.9V151.2z" />
          <path d="M105.9,151.2c0-7.1,5.8-12.9,12.9-12.9s12.9,5.8,12.9,12.9v32.3c0,7.1-5.8,12.9-12.9,12.9s-12.9-5.8-12.9-12.9V151.2z" />
        </g>
        <g fill="#36C5F0">
          <path d="M118.8,99.4c-7.1,0-12.9-5.8-12.9-12.9c0-7.1,5.8-12.9,12.9-12.9s12.9,5.8,12.9,12.9v12.9H118.8z" />
          <path d="M118.8,105.9c7.1,0,12.9,5.8,12.9,12.9s-5.8,12.9-12.9,12.9H86.5c-7.1,0-12.9-5.8-12.9-12.9s5.8-12.9,12.9-12.9H118.8z" />
        </g>
        <g fill="#2EB67D">
          <path d="M170.6,118.8c0-7.1,5.8-12.9,12.9-12.9c7.1,0,12.9,5.8,12.9,12.9s-5.8,12.9-12.9,12.9h-12.9V118.8z" />
          <path d="M164.1,118.8c0,7.1-5.8,12.9-12.9,12.9c-7.1,0-12.9-5.8-12.9-12.9V86.5c0-7.1,5.8-12.9,12.9-12.9c7.1,0,12.9,5.8,12.9,12.9V118.8z" />
        </g>
        <g fill="#ECB22E">
          <path d="M151.2,170.6c7.1,0,12.9,5.8,12.9,12.9c0,7.1-5.8,12.9-12.9,12.9c-7.1,0-12.9-5.8-12.9-12.9v-12.9H151.2z" />
          <path d="M151.2,164.1c-7.1,0-12.9-5.8-12.9-12.9c0-7.1,5.8-12.9,12.9-12.9h32.3c7.1,0,12.9,5.8,12.9,12.9c0,7.1-5.8,12.9-12.9,12.9H151.2z" />
        </g>
      </svg>
    ),
  },
};

/** Integration types that render a real vendor mark rather than a monogram. */
export const BRAND_ICON_TYPES: ReadonlySet<string> = new Set(Object.keys(MARKS));

export function BrandGlyph({
  type,
  label,
  className,
}: {
  type: string;
  label: string;
  className?: string;
}) {
  const mark = MARKS[type];

  if (mark) {
    return mark.render({ className: cn(mark.box ?? "size-5", className) });
  }

  return (
    <span
      aria-hidden
      className={cn("text-sm font-bold leading-none", className)}
    >
      {label.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
