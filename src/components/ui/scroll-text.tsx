"use client";

import * as React from "react";
import { motion, type Variants } from "motion/react";
import { cn } from "@/lib/utils";

type Direction = "left" | "right" | "up" | "down";

interface TextAnimationProps {
  /** The string to animate. */
  text: string;
  /** Wrapper element to render (defaults to an h1). */
  as?: keyof React.JSX.IntrinsicElements;
  classname?: string;
  /** Spacing utility applied to each word. */
  wordSpace?: string;
  /** Spacing utility applied to each character (when `letterAnime`). */
  charSpace?: string;
  /**
   * Framer-motion item variants (hidden/visible). When omitted, a sensible
   * blur-in default keyed off `direction` is used.
   */
  variants?: Variants;
  /** Direction the units travel in from their hidden state. */
  direction?: Direction;
  /** Animate character-by-character instead of word-by-word. */
  letterAnime?: boolean;
  /** Animate the whole line as a single unit. */
  lineAnime?: boolean;
  /** Re-trigger every time the text scrolls into view. */
  repeat?: boolean;
}

function hiddenFor(direction: Direction): Variants["hidden"] {
  const base = { opacity: 0, filter: "blur(8px)" };
  switch (direction) {
    case "right":
      return { ...base, x: 40 };
    case "up":
      return { ...base, y: 40 };
    case "down":
      return { ...base, y: -40 };
    case "left":
    default:
      return { ...base, x: -40 };
  }
}

export default function TextAnimation({
  text,
  as = "h1",
  classname = "",
  wordSpace = "mr-[0.25em]",
  charSpace = "mr-[0.01em]",
  variants,
  direction = "left",
  letterAnime = false,
  lineAnime = false,
  repeat = false,
}: TextAnimationProps) {
  const Wrapper = as as React.ElementType;

  const itemVariants: Variants = variants ?? {
    hidden: hiddenFor(direction),
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: 0.5, ease: "easeOut" },
    },
  };

  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        delayChildren: 0.1,
        staggerChildren: letterAnime ? 0.025 : 0.08,
      },
    },
  };

  const renderUnits = () => {
    if (lineAnime) {
      return (
        <motion.span variants={itemVariants} className="inline-block">
          {text}
        </motion.span>
      );
    }

    const words = text.split(" ");

    if (letterAnime) {
      return words.map((word, wi) => (
        <span key={wi} className={cn("inline-block", wordSpace)}>
          {Array.from(word).map((char, ci) => (
            <motion.span
              key={ci}
              variants={itemVariants}
              className={cn("inline-block", charSpace)}
            >
              {char}
            </motion.span>
          ))}
        </span>
      ));
    }

    return words.map((word, wi) => (
      <motion.span
        key={wi}
        variants={itemVariants}
        className={cn("inline-block", wordSpace)}
      >
        {word}
      </motion.span>
    ));
  };

  return (
    <Wrapper className={classname}>
      <motion.span
        className="inline-block"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: !repeat, amount: 0.3 }}
      >
        {renderUnits()}
      </motion.span>
    </Wrapper>
  );
}
