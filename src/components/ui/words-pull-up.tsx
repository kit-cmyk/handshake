"use client";

import * as React from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Staggered "pull up" text reveal — each word rises into place a beat after the
 * one before it. Used for the oversized display type on the marketing pages.
 *
 * Accessibility: splitting a heading into one element per word makes some
 * screen readers announce it word-by-word, or spell it out. So the real string
 * is rendered once into an `sr-only` node and the animated words are hidden
 * from the accessibility tree — assistive tech reads one clean sentence, and
 * the visible text is treated as decoration of it.
 *
 * The animation is skipped entirely under `prefers-reduced-motion`, in which
 * case the words render at their resting position rather than staying hidden.
 */

// Shared easing/curve for every word. A steep ease-out so words arrive quickly
// and settle, rather than drifting in.
const EASE = [0.16, 1, 0.3, 1] as const;
const DURATION = 0.6;
const STAGGER = 0.08;

interface WordsPullUpProps {
  text: string;
  className?: string;
  /**
   * Renders a small superscript asterisk hanging off the final word — the
   * footnote mark that gives the wordmark its editorial feel. Sized in `em` so
   * it tracks the headline's font size at every breakpoint.
   */
  showAsterisk?: boolean;
  /** Delay (seconds) before the first word starts, for sequencing with siblings. */
  delay?: number;
  /**
   * Play on first paint via CSS instead of waiting to scroll into view.
   *
   * Use this for above-the-fold text — above all the hero wordmark, which is
   * the page's LCP element. The scroll-triggered path below server-renders its
   * words at `opacity: 0` and only reveals them once React hydrates, which
   * would delay LCP to the hydration boundary. The CSS path (`.word-pull-up`
   * in `globals.css`) runs the identical reveal with no JS involved.
   */
  immediate?: boolean;
  style?: React.CSSProperties;
}

export function WordsPullUp({
  text,
  className,
  showAsterisk = false,
  delay = 0,
  immediate = false,
  style,
}: WordsPullUpProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const reduceMotion = useReducedMotion();
  const words = text.split(" ");

  // With reduced motion we still want the asterisk and layout, just no travel.
  const shown = reduceMotion || isInView;

  const asterisk = showAsterisk ? (
    <span className="absolute -right-[0.3em] top-[0.6em] text-[0.31em]">*</span>
  ) : null;

  return (
    <span ref={ref} className={cn("inline-flex flex-wrap", className)} style={style}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex flex-wrap">
        {words.map((word, i) => {
          const isLast = i === words.length - 1;
          const marginRight = isLast ? 0 : "0.25em";

          if (immediate) {
            return (
              <span
                key={`${word}-${i}`}
                className="word-pull-up relative inline-block"
                style={{
                  marginRight,
                  animationDelay: `${delay + i * STAGGER}s`,
                }}
              >
                {word}
                {isLast && asterisk}
              </span>
            );
          }

          return (
            <motion.span
              key={`${word}-${i}`}
              initial={reduceMotion ? false : { y: "0.35em", opacity: 0 }}
              animate={shown ? { y: 0, opacity: 1 } : undefined}
              transition={{
                duration: DURATION,
                delay: delay + i * STAGGER,
                ease: EASE,
              }}
              className="relative inline-block"
              style={{ marginRight }}
            >
              {word}
              {isLast && asterisk}
            </motion.span>
          );
        })}
      </span>
    </span>
  );
}

interface Segment {
  text: string;
  className?: string;
}

interface WordsPullUpMultiStyleProps {
  /**
   * Runs of text that share the same styling. Words are staggered continuously
   * across segment boundaries, so a heading reads as one phrase even when part
   * of it is set in a different color or weight.
   */
  segments: Segment[];
  className?: string;
  delay?: number;
  style?: React.CSSProperties;
}

export function WordsPullUpMultiStyle({
  segments,
  className,
  delay = 0,
  style,
}: WordsPullUpMultiStyleProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const reduceMotion = useReducedMotion();

  // Flatten to a single word list up front so the stagger index is continuous
  // across segments — restarting the delay per segment would read as a stutter.
  const words = React.useMemo(
    () =>
      segments.flatMap((seg) =>
        seg.text
          .split(" ")
          .filter(Boolean)
          .map((word) => ({ word, className: seg.className })),
      ),
    [segments],
  );

  const label = React.useMemo(
    () => segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim(),
    [segments],
  );

  const shown = reduceMotion || isInView;

  return (
    <span ref={ref} className={cn("inline-flex flex-wrap", className)} style={style}>
      <span className="sr-only">{label}</span>
      <span aria-hidden className="inline-flex flex-wrap">
        {words.map((w, i) => (
          <motion.span
            key={`${w.word}-${i}`}
            initial={reduceMotion ? false : { y: "0.35em", opacity: 0 }}
            animate={shown ? { y: 0, opacity: 1 } : undefined}
            transition={{
              duration: DURATION,
              delay: delay + i * STAGGER,
              ease: EASE,
            }}
            className={cn("inline-block", w.className)}
            style={{ marginRight: "0.25em" }}
          >
            {w.word}
          </motion.span>
        ))}
      </span>
    </span>
  );
}
