import Link from "next/link";
import { Handshake } from "lucide-react";
import { AuthBackground } from "./auth-background";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left — form column */}
      <div className="flex flex-col px-6 py-8 sm:px-12 lg:px-16">
        <Link href="/login" className="flex w-fit items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Handshake className="size-5" />
          </span>
          <span className="font-heading text-lg font-semibold tracking-tight">
            Handshake
          </span>
        </Link>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>

        <p className="text-center text-xs text-muted-foreground lg:text-left">
          &copy; {new Date().getFullYear()} Handshake. Close more deals, faster.
        </p>
      </div>

      {/* Right — testimonial panel (hidden on small screens) */}
      <div className="hidden p-3 lg:block">
        <div className="relative flex h-full w-full flex-col justify-between overflow-hidden rounded-3xl bg-primary p-10 text-white">
          {/* Animated shader gradient background */}
          <div className="absolute inset-0">
            <AuthBackground />
          </div>
          {/* Scrim for text legibility */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />

          <p className="relative z-10 max-w-xs font-heading text-lg font-medium leading-snug text-white/90">
            The CRM that keeps every deal moving — no lead left cold.
          </p>

          <div className="relative z-10">
            <div className="mb-5 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                Smart pipelines
              </span>
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                Automated follow-ups
              </span>
            </div>

            <blockquote className="font-heading text-2xl font-semibold leading-snug tracking-tight">
              &ldquo;We cut follow-up time in half and closed 30% more deals last
              quarter.&rdquo;
            </blockquote>

            <div className="mt-6 flex items-center justify-between">
              <div>
                <div className="font-medium">Sara Bright</div>
                <div className="text-sm text-white/70">
                  Head of Sales, Northwind
                </div>
              </div>
              <div className="flex gap-1.5" aria-hidden="true">
                <span className="h-1.5 w-6 rounded-full bg-white" />
                <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
