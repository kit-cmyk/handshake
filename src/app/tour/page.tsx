import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { LandingNav } from "@/components/landing/landing-nav";
import { TourGallery } from "@/components/landing/app-preview";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { NoiseBackground } from "@/components/landing/noise-background";

export const metadata: Metadata = {
  title: "Take a tour — Handshake",
  description:
    "A guided look at Handshake: the dashboard, deal pipeline, contacts, and campaigns your team will use every day.",
};

export default async function TourPage() {
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
        {/* Header */}
        <section className="pt-36 text-center sm:pt-44">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back home
          </Link>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
            Take a tour of Handshake
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            The real look and feel of the app your team will live in. Here are
            the screens you&rsquo;ll use every day.
          </p>
        </section>

        {/* Screens */}
        <section className="mt-20 sm:mt-28">
          <TourGallery />
        </section>
      </main>

      {/* CTA */}
      <footer className="px-4 pb-4 sm:px-6">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-primary px-6 py-16 text-center text-primary-foreground sm:py-20">
          <h2 className="mx-auto max-w-3xl text-3xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
            See it with your own data
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-primary-foreground/80">
            Spin up a workspace in minutes. Free to start, no credit card
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
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/30 px-7 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-foreground/10"
            >
              Back to home
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
