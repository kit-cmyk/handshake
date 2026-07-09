"use client";

import { useEffect } from "react";

/**
 * Enables smooth in-page anchor scrolling while a marketing page is mounted,
 * scoped to the document root (which is the element that scrolls). Removed on
 * unmount so the authenticated app keeps its default instant scrolling.
 * Honors `prefers-reduced-motion`.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const html = document.documentElement;
    html.classList.add("scroll-smooth");
    return () => html.classList.remove("scroll-smooth");
  }, []);

  return null;
}
