import Link from "next/link";
import {
  ArrowRight,
  Sparkles,
  Layers,
  Gauge,
  ShieldCheck,
  Quote,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingHero } from "@/components/landing/landing-hero";
import { FeatureBento } from "@/components/landing/feature-bento";
import { LeadFinder } from "@/components/landing/lead-finder";
import { Integrations } from "@/components/landing/integrations";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { NoiseBackground } from "@/components/landing/noise-background";
import { LandingGround } from "@/components/landing/landing-ground";
import { WordsPullUpMultiStyle } from "@/components/ui/words-pull-up";
import TextAnimation from "@/components/ui/scroll-text";

const CAPABILITIES = [
  "Lead Finder",
  "Lead Management",
  "Email Campaigns",
  "Deal Pipeline",
  "Workflows",
  "Segments",
  "Reporting",
];

const VALUES = [
  {
    icon: Sparkles,
    title: "Set up in an afternoon",
    body: "Import your contacts, connect your inbox, and start selling. No six-month rollout, no consultants.",
  },
  {
    icon: Layers,
    title: "One place for everything",
    body: "Contacts, deals, campaigns, and conversations live together — so nothing slips through the cracks.",
  },
  {
    icon: Gauge,
    title: "Built for speed",
    body: "Keyboard-first, instant search, and a pipeline that keeps up with how fast your team actually moves.",
  },
  {
    icon: ShieldCheck,
    title: "Your data, protected",
    body: "Row-level security, granular roles, and audit trails keep your customer data exactly where it belongs.",
  },
];

/**
 * Small numbered eyebrow that opens each section — the print-spread device that
 * ties the page together underneath the hero panel.
 */
function SectionLabel({
  index,
  children,
  tone = "default",
}: {
  index: string;
  children: React.ReactNode;
  tone?: "default" | "cream";
}) {
  return (
    <p
      className={
        tone === "cream"
          ? "flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-landing-cream/45"
          : "flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-muted-foreground"
      }
    >
      <span className="tabular-nums">{index}</span>
      <span
        className={
          tone === "cream"
            ? "h-px w-8 bg-landing-cream/25"
            : "h-px w-8 bg-border"
        }
      />
      {children}
    </p>
  );
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ctaHref = user ? "/dashboard" : "/signup";
  const ctaLabel = user ? "Go to dashboard" : "Get started free";

  return (
    <div className="landing-ground relative min-h-screen overflow-hidden bg-background font-sans text-foreground">
      <SmoothScroll />
      <NoiseBackground />

      <LandingNav authed={!!user} variant="tab" />

      <LandingHero authed={!!user} />

      {/* Wrapper exists so <LandingGround> can anchor to the hero's bottom
          edge rather than guessing at a viewport height. */}
      <div className="relative">
        <LandingGround />

        <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          {/* What you get — bento of product cards */}
          <section id="features" className="mt-16 scroll-mt-28 sm:mt-24">
            <SectionLabel index="01">What you get</SectionLabel>

            <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <h2 className="max-w-lg font-heading text-4xl font-medium leading-[0.92] tracking-[-0.05em] sm:text-5xl">
                Everything included
              </h2>
              <div className="flex flex-wrap gap-2 sm:max-w-md sm:justify-end">
                {CAPABILITIES.map((c) => (
                  <span
                    key={c}
                    className="rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-10">
              <FeatureBento />
            </div>

            {/* Testimonial, kept as a slim full-width strip so the bento above
                stays all product and the quote still gets its own moment. */}
            <figure className="mt-4 flex flex-col gap-6 rounded-3xl border bg-card p-7 shadow-sm sm:flex-row sm:items-center sm:gap-10 sm:p-9">
              <Quote className="size-8 shrink-0 text-primary" />
              <blockquote className="flex-1 font-heading text-xl font-medium leading-[1.2] tracking-[-0.02em] text-foreground sm:text-2xl">
                &ldquo;We switched on a Friday and the team was fully running by
                Monday. It just made sense.&rdquo;
              </blockquote>
              <figcaption className="flex shrink-0 items-center gap-3">
                <div className="grid size-9 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  MR
                </div>
                <div className="text-sm">
                  <div className="font-semibold">Maya Rivera</div>
                  <div className="text-muted-foreground">Head of Sales, Lumen</div>
                </div>
              </figcaption>
            </figure>
          </section>


          {/* Why choose us */}
          <section id="why" className="mt-24 scroll-mt-28 sm:mt-32">
            <div className="relative overflow-hidden rounded-3xl bg-landing-ink p-8 text-landing-cream sm:rounded-[2rem] sm:p-12 lg:p-16">
              <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.35] mix-blend-overlay" />
              {/* Brand glow, kept low so the cream type stays the brightest thing. */}
              <div
                className="pointer-events-none absolute inset-0 opacity-60"
                aria-hidden
                style={{
                  background:
                    "radial-gradient(70% 60% at 85% 0%, #3b5be0 0%, transparent 60%)",
                }}
              />

              <div className="relative">
                <SectionLabel index="02" tone="cream">
                  Why Handshake
                </SectionLabel>

                <h2 className="mt-8 max-w-3xl font-heading text-4xl font-medium leading-[0.92] tracking-[-0.05em] sm:text-5xl lg:text-6xl">
                  <WordsPullUpMultiStyle
                    segments={[
                      { text: "Why teams choose Handshake as their" },
                      { text: "home base", className: "text-landing-cream/45" },
                    ]}
                  />
                </h2>

                <div className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2">
                  {VALUES.map((v) => (
                    <div key={v.title} className="flex gap-4">
                      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-landing-cream text-landing-ink">
                        <v.icon className="size-5" strokeWidth={2.5} />
                      </div>
                      <div>
                        <h3 className="font-heading text-lg font-medium tracking-[-0.02em]">
                          {v.title}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-landing-cream/60">
                          {v.body}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Scroll-reveal statement */}
          <section className="py-28 text-center sm:py-40">
            {/* `TextAnimation` renders an h1 by default; the hero wordmark owns
                the page's only h1, so this statement is a heading below it. */}
            <TextAnimation
              as="h2"
              text="Turn conversations into closed deals."
              variants={{
                hidden: { filter: "blur(10px)", opacity: 0, y: 20 },
                visible: {
                  filter: "blur(0px)",
                  opacity: 1,
                  y: 0,
                  transition: { ease: "linear" },
                },
              }}
              classname="mx-auto max-w-4xl font-heading text-5xl font-medium leading-[0.9] tracking-[-0.055em] text-foreground sm:text-7xl"
            />
            <TextAnimation
              as="p"
              letterAnime
              text="built for teams who move fast"
              variants={{
                hidden: { filter: "blur(4px)", opacity: 0, y: 20 },
                visible: {
                  filter: "blur(0px)",
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.2 },
                },
              }}
              classname="mx-auto mt-8 max-w-md text-2xl font-medium lowercase text-muted-foreground sm:text-3xl"
            />
          </section>

          {/* Product showcase */}
          <section id="leads" className="scroll-mt-28">
            <SectionLabel index="03">Find leads</SectionLabel>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <h2 className="max-w-xl font-heading text-4xl font-medium leading-[0.92] tracking-[-0.05em] sm:text-5xl lg:text-6xl">
                The part other CRMs skip
              </h2>
              <p className="max-w-sm text-muted-foreground sm:text-right">
                Everything above helps you work a lead. This is where the lead
                comes from in the first place.
              </p>
            </div>
            <div className="mt-12">
              <LeadFinder />
            </div>
          </section>

          {/* Integrations / migration */}
          <section id="integrations" className="mt-24 scroll-mt-28 sm:mt-32">
            <SectionLabel index="04">Integrations</SectionLabel>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <h2 className="max-w-xl font-heading text-4xl font-medium leading-[0.92] tracking-[-0.05em] sm:text-5xl lg:text-6xl">
                Switch without leaving anything behind
              </h2>
              <p className="max-w-sm text-muted-foreground sm:text-right">
                Bring your contacts across from the CRM you already use, then
                keep working in the inbox and tools your team lives in.
              </p>
            </div>
            <div className="mt-12">
              <Integrations />
            </div>
          </section>
        </main>
      </div>

      {/* Footer CTA — the bookend to the hero: same ink panel, same oversized
          type, same pill-with-a-circle button. */}
      <footer className="px-2 pb-2 sm:px-3 sm:pb-3">
        <div className="relative mx-auto overflow-hidden rounded-2xl bg-landing-ink px-6 pb-6 pt-20 text-landing-cream sm:rounded-[2rem] sm:px-10 sm:pt-28">
          <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.35] mix-blend-overlay" />
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            aria-hidden
            style={{
              background:
                "radial-gradient(80% 70% at 15% 100%, #2743c9 0%, transparent 60%)",
            }}
          />

          <div className="relative mx-auto max-w-6xl">
            <div className="grid grid-cols-12 items-end gap-6">
              <div className="col-span-12 lg:col-span-8">
                <h2 className="font-heading text-[13vw] font-medium leading-[0.85] tracking-[-0.06em] sm:text-[11vw] lg:text-[8.5vw]">
                  <WordsPullUpMultiStyle
                    segments={[
                      { text: "Let's close more," },
                      { text: "together", className: "text-landing-cream/45" },
                    ]}
                  />
                </h2>
              </div>

              <div className="col-span-12 flex flex-col items-start gap-6 pb-4 lg:col-span-4 lg:pb-8">
                <p className="max-w-sm text-sm leading-snug text-landing-cream/60 sm:text-base">
                  Bring your team onto Handshake today. Free to start, no credit
                  card required.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={ctaHref}
                    className="group inline-flex items-center gap-2 rounded-full bg-landing-cream py-1 pl-5 pr-1 text-sm font-semibold text-landing-ink transition-all hover:gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-landing-cream sm:text-base"
                  >
                    {ctaLabel}
                    <span className="flex size-9 items-center justify-center rounded-full bg-landing-ink transition-transform group-hover:scale-110 sm:size-10">
                      <ArrowRight className="size-4 text-landing-cream" />
                    </span>
                  </Link>
                  {!user && (
                    <Link
                      href="/login"
                      className="rounded-full border border-landing-cream/30 px-6 py-3 text-sm font-semibold text-landing-cream transition-colors hover:bg-landing-cream/10"
                    >
                      Log in
                    </Link>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-16 flex flex-col items-start justify-between gap-3 border-t border-landing-cream/15 pt-5 text-xs text-landing-cream/40 sm:flex-row sm:items-center">
              <span className="uppercase tracking-[0.18em]">Handshake</span>
              <span>
                &copy; {new Date().getFullYear()} Handshake. All rights
                reserved.
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
