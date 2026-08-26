"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { WordsPullUp } from "@/components/ui/words-pull-up";
import { HeroBackdrop } from "@/components/landing/hero-backdrop";

/**
 * The marketing hero: one full-viewport rounded panel holding an animated
 * backdrop, with the wordmark set as oversized display type along the bottom
 * edge and the pitch + call to action balanced against it on the right.
 *
 * Sizing note — the wordmark is measured in `vw` rather than `rem` so it always
 * spans roughly the same *fraction* of the viewport (about 60% on desktop,
 * ~85% on phones, where it needs to fill more of a narrow screen to read as a
 * display element). "Handshake" is nine characters, so the vw values are
 * noticeably smaller than they would be for a shorter word; changing the word
 * means re-tuning this scale.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

export function LandingHero({ authed }: { authed: boolean }) {
  const reduceMotion = useReducedMotion();

  // Sibling elements fade up after the wordmark's stagger has mostly played.
  const rise = (delay: number) => ({
    initial: reduceMotion ? false : { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { duration: 0.8, delay, ease: EASE },
  });

  return (
    <section className="w-full p-2 sm:p-3">
      <div className="relative h-[100svh] max-h-[1100px] min-h-[600px] w-full overflow-hidden rounded-2xl md:rounded-[2rem]">
        <HeroBackdrop />

        {/* Content sits on the bottom edge; the panel above it stays open so the
            backdrop has room to breathe. */}
        <div className="absolute inset-x-0 bottom-0 px-4 pb-3 sm:px-6 md:px-10 md:pb-5">
          <div className="grid grid-cols-12 items-end gap-4 lg:gap-10">
            <div className="col-span-12 lg:col-span-8">
              {/* Size budget: "Handshake" in Outfit at this tracking measures
                  ~4.56em, and the trailing asterisk hangs ~0.1em past that. At
                  `lg` the 8-of-12 cell is only ~63vw wide, so anything above
                  ~12.9vw overruns the cell and slides under the copy column.
                  Keep these values under that ceiling — and re-measure if the
                  word, the tracking, or the column split ever changes. */}
              <h1
                className="font-heading text-[19vw] font-medium leading-[0.85] tracking-[-0.07em] text-landing-cream sm:text-[18vw] md:text-[16vw] lg:text-[12vw] xl:text-[11.5vw] 2xl:text-[12vw]"
              >
                {/* `immediate` keeps this off the hydration critical path —
                    it is the LCP element. */}
                <WordsPullUp text="Handshake" showAsterisk immediate />
              </h1>
            </div>

            <div className="col-span-12 flex flex-col items-start gap-5 pb-6 lg:col-span-4 lg:pb-10">
              <motion.span
                {...rise(0.35)}
                className="inline-flex items-center gap-2 rounded-full border border-landing-cream/25 bg-landing-cream/10 px-3 py-1 text-[11px] font-medium text-landing-cream/80 backdrop-blur-sm"
              >
                <span className="size-1.5 rounded-full bg-emerald-400" />
                The CRM your team will actually use
              </motion.span>

              <motion.p
                {...rise(0.5)}
                className="text-xs leading-[1.35] text-landing-cream/70 sm:text-sm md:text-base"
              >
                Handshake brings your contacts, campaigns, and pipeline into one
                fast, friendly workspace — so your team spends less time on admin
                and more time winning.
              </motion.p>

              <motion.div {...rise(0.7)}>
                <Link
                  href={authed ? "/dashboard" : "/signup"}
                  className="group inline-flex items-center gap-2 rounded-full bg-landing-cream py-1 pl-5 pr-1 text-sm font-semibold text-landing-ink transition-all hover:gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-landing-cream sm:text-base"
                >
                  {authed ? "Go to dashboard" : "Start free"}
                  <span className="flex size-9 items-center justify-center rounded-full bg-landing-ink transition-transform group-hover:scale-110 sm:size-10">
                    <ArrowRight className="size-4 text-landing-cream" />
                  </span>
                </Link>
              </motion.div>
            </div>
          </div>

          {/* Footnote for the wordmark's asterisk — the editorial payoff. */}
          <motion.p
            {...rise(0.9)}
            className="mt-4 border-t border-landing-cream/15 pt-3 text-[10px] uppercase tracking-[0.18em] text-landing-cream/40 sm:text-[11px]"
          >
            * Free to start. No credit card, no sales call.
          </motion.p>
        </div>
      </div>
    </section>
  );
}
