import { cn } from "@/lib/utils";
import {
  DashboardScreen,
  DealsScreen,
  ContactsScreen,
  CampaignsScreen,
} from "@/components/landing/app-preview";

/**
 * Bento grid of product cards: a cropped app screen bleeding off the top of
 * each card, fading into a copy block at the bottom.
 *
 * The visuals are the real app UI rendered as markup (`app-preview.tsx`), not
 * captured PNGs — the repo has no raster assets. That is mostly an upgrade:
 * they stay sharp at any density and cannot drift out of date the way a stale
 * screenshot does. Each is wrapped in `.app-shot`, which pins the app's light
 * palette so they read as bright product shots on the dark cards in both
 * themes.
 *
 * Each screen is authored at roughly desktop width, so it is rendered at full
 * size and scaled down with a transform rather than reflowed — a reflowed
 * "screenshot" at card width would rearrange into a layout the product does not
 * actually have. `origin-top-left` plus overflow crop is what produces the
 * zoomed, edge-bleeding look.
 */

/** Ink-to-transparent scrim so the copy always sits on solid ground. */
const SCRIM =
  "linear-gradient(to top, var(--landing-ink) 0%, var(--landing-ink) 18%," +
  "color-mix(in oklab, var(--landing-ink) 55%, transparent) 55%, transparent 100%)";

function Shot({
  children,
  scale = 0.72,
  height = 380,
  className,
}: {
  children: React.ReactNode;
  /** Zoom level of the mock screen. Lower shows more of the layout. */
  scale?: number;
  /**
   * Unscaled height of the shot, in px. This has to be a definite length:
   * several of the screens size themselves with `h-full`, which collapses to
   * auto inside an absolutely-positioned parent of indefinite height, and the
   * screen would render squashed instead of cropped.
   */
  height?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "app-shot pointer-events-none absolute select-none overflow-hidden rounded-xl border border-black/10 bg-background p-3 shadow-2xl",
        className,
      )}
      style={{
        // Counter the scale so the element still fills the card's width once
        // shrunk, instead of leaving a gap on the right.
        width: `${100 / scale}%`,
        height,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
      }}
    >
      {children}
    </div>
  );
}

function BentoCard({
  eyebrow,
  title,
  body,
  visual,
  className,
  visualHeight = "h-52 sm:h-56",
}: {
  eyebrow: string;
  title: string;
  body: string;
  visual?: React.ReactNode;
  className?: string;
  visualHeight?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-3xl bg-landing-ink text-landing-cream",
        className,
      )}
    >
      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.3] mix-blend-overlay" />

      {visual && (
        <div className={cn("relative shrink-0 overflow-hidden", visualHeight)}>
          {visual}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: SCRIM }}
          />
        </div>
      )}

      <div className="relative flex flex-1 flex-col p-6 pt-0 sm:p-7 sm:pt-0">
        <p className="text-[11px] uppercase tracking-[0.18em] text-landing-cream/45">
          {eyebrow}
        </p>
        <h3 className="mt-2 font-heading text-xl font-medium tracking-[-0.03em] sm:text-2xl">
          {title}
        </h3>
        <p className="mt-2 max-w-md text-sm leading-snug text-landing-cream/60">
          {body}
        </p>
      </div>
    </div>
  );
}

export function FeatureBento() {
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      {/* Row 1 — two wide cards. */}
      <BentoCard
        className="lg:col-span-5"
        eyebrow="Deal Pipeline"
        title="Move every deal forward"
        body="Drag deals across stages on a board that keeps up. See what is close, and what is stuck, at a glance."
        visual={
          <Shot scale={0.62} className="left-6 top-7">
            <DealsScreen />
          </Shot>
        }
      />
      <BentoCard
        className="lg:col-span-7"
        eyebrow="Dashboard"
        title="Your whole pipeline, the moment you log in"
        body="Live counts, and one-click jumps into everything that matters — no digging required."
        visual={
          <Shot scale={0.7} className="left-7 top-7">
            <DashboardScreen />
          </Shot>
        }
      />

      {/* Row 2 — three cards. */}
      <BentoCard
        className="lg:col-span-4"
        eyebrow="Contacts"
        title="Every person, searchable instantly"
        body="A fast, sortable table built to scale to your whole book."
        visual={
          <Shot scale={0.6} className="left-5 top-6">
            <ContactsScreen />
          </Shot>
        }
      />
      <BentoCard
        className="lg:col-span-4"
        eyebrow="Campaigns"
        title="Outreach with numbers you can trust"
        body="Track sends, opens, and replies across every sequence."
        visual={
          <Shot scale={0.6} className="left-5 top-6">
            <CampaignsScreen />
          </Shot>
        }
      />

      {/* Proof cell — carries the numbers instead of a screen, so the row has a
          typographic beat rather than three identical shots. */}
      <div className="relative flex flex-col justify-between gap-6 overflow-hidden rounded-3xl bg-landing-ink p-6 text-landing-cream sm:p-7 lg:col-span-4">
        <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.3] mix-blend-overlay" />
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          aria-hidden
          style={{
            background:
              "radial-gradient(80% 60% at 100% 0%, #3b5be0 0%, transparent 60%)",
          }}
        />
        <p className="relative text-[11px] uppercase tracking-[0.18em] text-landing-cream/45">
          In the first quarter
        </p>
        <div className="relative">
          <div className="font-heading text-5xl font-medium leading-[0.85] tracking-[-0.06em] sm:text-6xl">
            40%
          </div>
          <p className="mt-2 text-sm leading-snug text-landing-cream/60">
            more deals closed by teams on Handshake.
          </p>
        </div>
        <div className="relative h-px bg-landing-cream/15" />
        <div className="relative">
          <div className="font-heading text-5xl font-medium leading-[0.85] tracking-[-0.06em] sm:text-6xl">
            8&nbsp;hrs
          </div>
          <p className="mt-2 text-sm leading-snug text-landing-cream/60">
            saved per rep, per week — back to selling, not data entry.
          </p>
        </div>
      </div>
    </div>
  );
}
