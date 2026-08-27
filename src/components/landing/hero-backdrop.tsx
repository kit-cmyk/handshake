"use client";

import * as React from "react";
import dynamic from "next/dynamic";

/**
 * Animated backdrop for the marketing hero panel: a slow WebGL mesh gradient in
 * the brand blues, finished with film grain and a top/bottom vignette so the
 * cream display type keeps its contrast wherever the gradient happens to drift.
 *
 * Three layers, back to front:
 *   1. a static CSS gradient — always painted, so the panel is never empty
 *      before the canvas mounts, and is the whole backdrop when WebGL is
 *      unavailable or the visitor prefers reduced motion
 *   2. the ShaderGradient canvas
 *   3. grain + vignette overlays
 *
 * The canvas is deliberately *not* rendered on the first paint. The hero's
 * headline is this page's LCP element, and spinning up Three.js in the same
 * frame delays it; mounting on the next idle callback keeps the text first.
 */

// Three.js / WebGL can only run in the browser, so load these client-side only.
// (Matches the treatment in `(auth)/auth-background.tsx`, which is also why the
// bare `@shadergradient/react` specifier is aliased in `next.config.ts`.)
const ShaderGradientCanvas = dynamic(
  () => import("@shadergradient/react").then((m) => m.ShaderGradientCanvas),
  { ssr: false },
);
const ShaderGradient = dynamic(
  () => import("@shadergradient/react").then((m) => m.ShaderGradient),
  { ssr: false },
);

// Deep navy → brand blue → near-black. Mirrors `--landing-ink` at the dark end
// so the canvas and the static fallback blend into the same panel color.
const STATIC_GRADIENT =
  "radial-gradient(120% 90% at 20% 15%, #2743c9 0%, transparent 55%)," +
  "radial-gradient(100% 80% at 85% 30%, #4667e8 0%, transparent 50%)," +
  "linear-gradient(160deg, #131a33 0%, #0d1122 55%, #090b16 100%)";

export function HeroBackdrop() {
  const [showCanvas, setShowCanvas] = React.useState(false);

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Defer past the first paint so the headline wins the race for the frame.
    const idle = window.requestIdleCallback;
    if (typeof idle === "function") {
      const handle = idle(() => setShowCanvas(true), { timeout: 1500 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(() => setShowCanvas(true), 300);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* 1. Always-on static wash — the canvas fades in over the top of it. */}
      <div className="absolute inset-0" style={{ background: STATIC_GRADIENT }} />

      {/* 2. Animated mesh. */}
      {showCanvas && (
        <div className="absolute inset-0 animate-in fade-in duration-1000">
          <ShaderGradientCanvas
            style={{ width: "100%", height: "100%" }}
            lazyLoad={undefined}
            fov={100}
            pixelDensity={1}
            pointerEvents="none"
          >
            <ShaderGradient
              animate="on"
              type="waterPlane"
              wireframe={false}
              shader="defaults"
              uTime={8}
              uSpeed={0.16}
              uStrength={1.8}
              uDensity={1.4}
              uFrequency={5.5}
              uAmplitude={0}
              positionX={0}
              positionY={0}
              positionZ={0}
              rotationX={45}
              rotationY={0}
              rotationZ={-60}
              color1="#0d1122"
              color2="#3b5be0"
              color3="#1b2a6b"
              reflection={0.1}
              // View (camera) props
              cAzimuthAngle={180}
              cPolarAngle={80}
              cDistance={2.6}
              cameraZoom={9.1}
              // Effect props
              lightType="3d"
              brightness={1.1}
              envPreset="dawn"
              grain="on"
              // Tool props
              toggleAxis={false}
              zoomOut={false}
              hoverState=""
              enableTransition={false}
            />
          </ShaderGradientCanvas>
        </div>
      )}

      {/* 3a. Film grain. */}
      <div className="noise-overlay absolute inset-0 opacity-[0.55] mix-blend-overlay" />

      {/* 3b. Vignette — darkens the top so the nav tab reads, and the bottom so
              the headline and body copy sit on solid ground. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/75" />
    </div>
  );
}
