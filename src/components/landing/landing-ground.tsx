/**
 * Decoration for the stretch of page *below* the hero panel.
 *
 * `NoiseBackground` anchors its brand glow to the top of the document (`15% 0%`
 * / `90% 5%`), which was right when the hero was an inline block starting at
 * `pt-36`. The hero is now a full-viewport panel, so that glow is painted
 * entirely behind it and never seen — leaving everything below on a flat
 * ground with nothing tying it back to the hero. This layer puts the glow back
 * where the content actually is, and softens the seam where the two meet.
 *
 * It is positioned against a wrapper around `<main>` rather than the page root
 * so its top edge lands exactly on the hero's bottom edge, whatever height the
 * hero resolves to (it is clamped by `min-h`/`max-h`, so it is not reliably
 * `100svh`).
 *
 * Sits at `-z-10`: a parent's own background always paints beneath its
 * children, so this still renders above the page background while staying
 * behind the content — the same trick `NoiseBackground` relies on.
 */
export function LandingGround() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[160vh] overflow-hidden"
    >
      {/* Ink bleed — carries the hero's color a short way down the page so the
          panel and the ground do not meet as a hard horizontal edge. In dark
          mode the ground is already near-ink, so this is nearly invisible by
          design; it does its work in light mode. */}
      <div
        className="absolute inset-x-0 top-0 h-[32vh]"
        style={{
          background:
            "linear-gradient(to bottom, color-mix(in oklab, var(--landing-ink) 20%, transparent) 0%, transparent 100%)",
        }}
      />

      {/* Brand glow, re-anchored to the content region. */}
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(55% 28% at 12% 14%, color-mix(in oklch, var(--primary) 20%, transparent), transparent 60%)," +
            "radial-gradient(50% 30% at 92% 32%, color-mix(in oklch, var(--primary) 15%, transparent), transparent 58%)",
        }}
      />
    </div>
  );
}
