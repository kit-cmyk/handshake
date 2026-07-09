import Link from "next/link";
import {
  ArrowUpRight,
  TrendingUp,
  Sparkles,
  Layers,
  Gauge,
  ShieldCheck,
  Quote,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { LandingNav } from "@/components/landing/landing-nav";
import { FeatureTabs } from "@/components/landing/feature-tabs";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { NoiseBackground } from "@/components/landing/noise-background";
import TextAnimation from "@/components/ui/scroll-text";

const CAPABILITIES = [
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

const LOGOS = ["Northwind", "Acme Co", "Lumen", "Patex", "Consbit", "Todobit"];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="relative min-h-screen overflow-hidden bg-background font-sans text-foreground">
      <SmoothScroll />
      <NoiseBackground />

      <LandingNav authed={!!user} />

      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        {/* Hero */}
        <section className="pt-36 text-center sm:pt-44">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card/70 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            The CRM your team will actually use
          </span>

          <h1 className="mx-auto mt-6 max-w-4xl text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
            Close more deals,
            <br className="hidden sm:block" /> in less time
            <TrendingUp
              className="ml-2 inline size-9 align-middle text-primary sm:size-12 lg:size-14"
              strokeWidth={2.5}
            />
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
            Handshake brings your contacts, campaigns, and pipeline into one
            fast, friendly workspace — so your team can spend less time on
            admin and more time winning.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={user ? "/dashboard" : "/signup"}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90"
            >
              {user ? "Go to dashboard" : "Start free"}
              <ArrowUpRight className="size-4" strokeWidth={2.5} />
            </Link>
            <a
              href="#product"
              className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-7 py-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-card"
            >
              See how it works
            </a>
          </div>
        </section>

        {/* Cards row */}
        <section className="mt-16 grid gap-4 sm:mt-20 md:grid-cols-3">
          {/* Capabilities */}
          <div className="rounded-3xl border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-bold tracking-tight">
              Everything included
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {CAPABILITIES.map((c) => (
                <span
                  key={c}
                  className="rounded-full border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="flex flex-col gap-4 rounded-3xl bg-primary p-6 text-primary-foreground">
            <div>
              <div className="text-4xl font-extrabold tracking-tight">40%</div>
              <p className="mt-1 text-sm text-primary-foreground/70">
                more deals closed by teams in their first quarter on Handshake.
              </p>
            </div>
            <div className="h-px bg-primary-foreground/15" />
            <div>
              <div className="text-4xl font-extrabold tracking-tight">
                8&nbsp;hrs
              </div>
              <p className="mt-1 text-sm text-primary-foreground/70">
                saved per rep, per week — back to selling, not data entry.
              </p>
            </div>
          </div>

          {/* Testimonial */}
          <div className="flex flex-col justify-between rounded-3xl border bg-card p-6 shadow-sm">
            <Quote className="size-8 text-primary" />
            <p className="mt-4 text-base font-medium leading-relaxed text-foreground">
              &ldquo;We switched on a Friday and the team was fully running by
              Monday. It just made sense.&rdquo;
            </p>
            <div className="mt-5 flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                MR
              </div>
              <div className="text-sm">
                <div className="font-semibold">Maya Rivera</div>
                <div className="text-muted-foreground">
                  Head of Sales, Lumen
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why choose us */}
        <section id="why" className="mt-24 scroll-mt-28 sm:mt-32">
          <div className="rounded-3xl bg-primary p-8 text-primary-foreground sm:p-12 lg:p-16">
            <h2 className="max-w-md text-3xl font-extrabold tracking-tight sm:text-4xl">
              Why teams choose Handshake as their home base
            </h2>
            <div className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2">
              {VALUES.map((v) => (
                <div key={v.title} className="flex gap-4">
                  <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-foreground text-primary">
                    <v.icon className="size-5" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold tracking-tight">
                      {v.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-primary-foreground/70">
                      {v.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Scroll-reveal statement */}
        <section className="py-28 text-center sm:py-40">
          <TextAnimation
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
            classname="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl"
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
            classname="mx-auto mt-6 max-w-md text-2xl font-medium lowercase text-muted-foreground sm:text-3xl"
          />
        </section>

        {/* Product showcase */}
        <section id="product" className="scroll-mt-28">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              See Handshake in action
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              One workspace, four ways to move revenue forward.
            </p>
          </div>
          <div className="mt-10">
            <FeatureTabs />
          </div>
        </section>

        {/* Logos */}
        <section
          id="customers"
          className="mt-24 scroll-mt-28 text-center sm:mt-32"
        >
          <p className="text-sm font-medium text-muted-foreground">
            Trusted by fast-moving revenue teams
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
            {LOGOS.map((logo) => (
              <span
                key={logo}
                className="text-xl font-extrabold tracking-tight text-muted-foreground/50 transition-colors hover:text-foreground/70"
              >
                {logo}
              </span>
            ))}
          </div>
        </section>
      </main>

      {/* Footer CTA */}
      <footer className="px-4 pb-4 sm:px-6">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-primary px-6 py-16 text-center text-primary-foreground sm:py-20">
          <h2 className="mx-auto max-w-3xl text-4xl font-extrabold leading-[1] tracking-tight sm:text-6xl">
            Let&rsquo;s close more, together
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-primary-foreground/80">
            Bring your team onto Handshake today. Free to start, no credit card
            required.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={user ? "/dashboard" : "/signup"}
              className="inline-flex items-center gap-2 rounded-full bg-primary-foreground px-7 py-3.5 text-sm font-semibold text-primary transition-transform hover:scale-[1.02]"
            >
              {user ? "Go to dashboard" : "Get started free"}
              <ArrowUpRight className="size-4" strokeWidth={2.5} />
            </Link>
            {!user && (
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/30 px-7 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-foreground/10"
              >
                Log in
              </Link>
            )}
          </div>
        </div>

        <div className="mx-auto mt-6 flex max-w-6xl flex-col items-center justify-between gap-3 px-2 pb-6 text-sm text-muted-foreground sm:flex-row">
          <span className="font-semibold text-foreground/70">Handshake</span>
          <span>
            &copy; {new Date().getFullYear()} Handshake. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}
