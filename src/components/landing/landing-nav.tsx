"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Handshake } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV_LINKS = [
  { label: "Product", hash: "#product" },
  { label: "Why Handshake", hash: "#why" },
  { label: "Customers", hash: "#customers" },
];

export function LandingNav({ authed }: { authed: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState<string>("");
  const pathname = usePathname();
  const onHome = pathname === "/";
  // On the home page use in-page scroll anchors; elsewhere navigate home first.
  const linkFor = (hash: string) => (onHome ? hash : `/${hash}`);

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
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:pt-6">
      <nav className="mx-auto flex max-w-5xl items-center justify-between gap-3 rounded-full border bg-card/90 py-2 pl-5 pr-2 text-card-foreground shadow-md backdrop-blur supports-[backdrop-filter]:bg-card/70">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-extrabold tracking-tight"
        >
          <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">
            <Handshake className="size-4" strokeWidth={2.5} />
          </span>
          Handshake
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => {
            const isActive = onHome && active === link.hash.slice(1);
            return (
              <a
                key={link.hash}
                href={linkFor(link.hash)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "text-sm font-medium underline-offset-8 transition-colors hover:text-foreground",
                  isActive
                    ? "text-foreground underline decoration-primary decoration-2"
                    : "text-muted-foreground"
                )}
              >
                {link.label}
              </a>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          {authed ? (
            <Link
              href="/dashboard"
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
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
            className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      <div
        className={cn(
          "mx-auto mt-2 max-w-5xl overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-md transition-all md:hidden",
          open
            ? "max-h-64 opacity-100"
            : "pointer-events-none max-h-0 opacity-0",
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
                  "rounded-lg px-4 py-3 text-sm font-medium underline-offset-4 transition-colors hover:bg-accent hover:text-foreground",
                  isActive
                    ? "text-foreground underline decoration-primary decoration-2"
                    : "text-muted-foreground"
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
              className="rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:hidden"
            >
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
