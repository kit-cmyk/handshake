/**
 * Marketing-page background: a subtle black→blue gradient wash, a center-masked
 * dot grid, and a faint animated grain overlay. Kept low-opacity so page
 * content stays fully readable. Presentational and theme-aware — sits behind
 * page content.
 */
// Self-contained film grain (SVG feTurbulence as a data URI) — no network
// asset, no animation cost. The feColorMatrix maps the noise's red channel
// into the ALPHA channel (last row = `1 0 0 0 0`), so when this SVG is used as
// a CSS mask the speckles vary in opacity and actually punch through. A plain
// grayscale (opaque) noise would mask uniformly and read as a flat tint.
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export function NoiseBackground() {
  // Fade the dot grid in toward the center and out at the edges so it never
  // competes with body copy.
  const dotMask =
    "radial-gradient(circle 80% at 50% 40%, #000 55%, transparent 100%)";

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* Subtle black→blue gradient wash: deep blue glow up top easing into a
          near-black tint at the bottom edges. Low opacity keeps text readable. */}
      <div
        className="absolute inset-0 opacity-[0.10] dark:opacity-[0.5]"
        style={{
          background:
            "linear-gradient(to bottom, oklch(0.30 0.13 262) 0%, oklch(0.20 0.06 264) 45%, oklch(0.13 0.02 264) 100%)",
        }}
      />

      {/* Blue brand glow anchored to the hero */}
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 40% at 15% 0%, color-mix(in oklch, var(--primary) 22%, transparent), transparent 60%), radial-gradient(55% 45% at 90% 5%, color-mix(in oklch, var(--primary) 18%, transparent), transparent 55%)",
        }}
      />

      {/* Center-masked dot grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(color-mix(in oklch, var(--foreground) 22%, transparent) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
          maskImage: dotMask,
          WebkitMaskImage: dotMask,
        }}
      />

      {/* Brand-tinted grain: fill with the primary color, punch it through the
          noise as an alpha mask so speckles read against the background. */}
      <div
        className="absolute inset-0 opacity-[0.45] dark:opacity-[0.55]"
        style={{
          backgroundColor: "var(--primary)",
          maskImage: NOISE,
          WebkitMaskImage: NOISE,
          maskSize: "140px 140px",
          WebkitMaskSize: "140px 140px",
          maskRepeat: "repeat",
          WebkitMaskRepeat: "repeat",
        }}
      />
    </div>
  );
}
