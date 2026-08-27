"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Handshake } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Keep these in the order the sections actually appear on the landing page, and
 * keep each label matching that section's on-page heading — the scroll-spy
 * below highlights whichever of these is in view, so a nav that runs out of
 * order reads as though it is jumping backwards up the page. Every hash here
 * needs a matching `id` *and* a `scroll-mt` on the target section, or it lands
 * underneath the fixed header.
 */
const NAV_LINKS = [
  { label: "What you get", hash: "#features" },
  { label: "Why Handshake", hash: "#why" },
  { label: "Find leads", hash: "#leads" },
  { label: "Integrations", hash: "#integrations" },
];

/**
 * `pill` — the floating rounded bar on a themed background (used by /tour).
 * `tab`  — an ink-colored tab that hangs off the top edge with its bottom
 *          corners rounded, matching the editorial panels on the landing page.
 *          It stays ink in both light and dark mode on purpose: it has to read
 *          against the dark hero panel *and* against the light page ground once
 *          you scroll past it, and one fixed color does both without any
 *          scroll-position bookkeeping.
 */
type NavVariant = "pill" | "tab";

export function LandingNav({
  authed,
  variant = "pill",
}: {
  authed: boolean;
  variant?: NavVariant;
}) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState<string>("");
  const pathname = usePathname();
  const onHome = pathname === "/";
  // On the home page use in-page scroll anchors; elsewhere navigate home first.
  const linkFor = (hash: string) => (onHome ? hash : `/${hash}`);
  const isTab = variant === "tab";

  // Scroll-spy: highlight the nav link for whichever section is in view.
  React.useEffect(() => {
    if (!onHome) return;
    const ids = NAV_LINKS.map((l) => l.hash.slice(1));
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    // Track visibility ratios and pick the most-visible section.
    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        let best = "";
        let bestRatio = 0;
        for (const [id, ratio] of ratios) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = id;
          }
        }
        setActive(best);
      },
      // Offset the top by the fixed header so a section counts as active once
      // it clears the nav, not when it merely touches the viewport edge.
      { rootMargin: "-96px 0px -55% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [onHome]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 z-50",
        // Line the tab up with the top edge of the hero panel, which is inset
        // by the same p-2/p-3 as the hero section wrapper.
        isTab
          ? "top-2 flex justify-center px-2 sm:top-3 sm:px-3"
          : "top-0 px-4 pt-4 sm:pt-6",
      )}
    >
      <nav
        className={cn(
          "flex items-center",
          isTab
            ? "gap-2 rounded-t-md rounded-b-2xl bg-landing-ink py-2 pl-4 pr-2 text-landing-cream shadow-lg sm:gap-4 md:gap-6 md:rounded-b-3xl md:pl-6"
            : "mx-auto max-w-5xl justify-between gap-3 rounded-full border bg-card/90 py-2 pl-5 pr-2 text-card-foreground shadow-md backdrop-blur supports-[backdrop-filter]:bg-card/70",
        )}
      >
        <Link
          href={authed ? "/dashboard" : "/"}
          aria-label={authed ? "Handshake, go to dashboard" : "Handshake, home"}
          className={cn(
            "flex items-center gap-2 text-base font-extrabold tracking-tight",
            isTab && "text-landing-cream",
          )}
        >
          <span
            className={cn(
              "grid size-7 place-items-center rounded-full",
              isTab
                ? "bg-landing-cream text-landing-ink"
                : "bg-primary text-primary-foreground",
            )}
          >
            <Handshake className="size-4" strokeWidth={2.5} />
          </span>
          <span className={cn(isTab && "hidden sm:inline")}>Handshake</span>
        </Link>

        <div
          className={cn(
            "hidden items-center md:flex",
            isTab ? "gap-6 lg:gap-8" : "gap-7",
          )}
        >
          {NAV_LINKS.map((link) => {
            const isActive = onHome && active === link.hash.slice(1);
            return (
              <a
                key={link.hash}
                href={linkFor(link.hash)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "text-sm font-medium underline-offset-8 transition-colors",
                  isTab
                    ? isActive
                      ? "text-landing-cream underline decoration-2"
                      : "text-landing-cream/60 hover:text-landing-cream"
                    : isActive
                      ? "text-foreground underline decoration-primary decoration-2"
                      : "text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
              </a>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <ThemeToggle
            className={cn(
              isTab &&
                "text-landing-cream/60 hover:bg-landing-cream/10 hover:text-landing-cream",
            )}
          />
          {authed ? (
            <Link
              href="/dashboard"
              className={cn(
                "rounded-full px-5 py-2 text-sm font-semibold transition-colors",
                isTab
                  ? "bg-landing-cream text-landing-ink hover:bg-landing-cream/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className={cn(
                  "hidden rounded-full px-4 py-2 text-sm font-medium transition-colors sm:inline-flex",
                  isTab
                    ? "text-landing-cream/60 hover:text-landing-cream"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className={cn(
                  "rounded-full px-5 py-2 text-sm font-semibold transition-colors",
                  isTab
                    ? "bg-landing-cream text-landing-ink hover:bg-landing-cream/90"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                Book a demo
              </Link>
            </>
          )}
          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "grid size-9 place-items-center rounded-full transition-colors md:hidden",
              isTab
                ? "text-landing-cream/70 hover:bg-landing-cream/10 hover:text-landing-cream"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      <div
        className={cn(
          "overflow-hidden shadow-md transition-all md:hidden",
          isTab
            ? "absolute inset-x-2 top-full mt-2 rounded-2xl bg-landing-ink text-landing-cream sm:inset-x-3"
            : "mx-auto mt-2 max-w-5xl rounded-2xl border bg-card text-card-foreground",
          open ? "max-h-64 opacity-100" : "pointer-events-none max-h-0 opacity-0",
        )}
      >
        <div className="flex flex-col p-3">
          {NAV_LINKS.map((link) => {
            const isActive = onHome && active === link.hash.slice(1);
            return (
              <a
                key={link.hash}
                href={linkFor(link.hash)}
                onClick={() => setOpen(false)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "rounded-lg px-4 py-3 text-sm font-medium underline-offset-4 transition-colors",
                  isTab
                    ? isActive
                      ? "bg-landing-cream/10 text-landing-cream underline decoration-2"
                      : "text-landing-cream/70 hover:bg-landing-cream/10 hover:text-landing-cream"
                    : isActive
                      ? "text-foreground underline decoration-primary decoration-2"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {link.label}
              </a>
            );
          })}
          {!authed && (
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-lg px-4 py-3 text-sm font-medium transition-colors sm:hidden",
                isTab
                  ? "text-landing-cream/70 hover:bg-landing-cream/10 hover:text-landing-cream"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
