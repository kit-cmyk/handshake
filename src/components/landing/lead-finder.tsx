import { Search, MapPin, Star, Globe, Phone, Mail, Check } from "lucide-react";

/**
 * Deep-dive on Lead Finder — the capability that separates Handshake from a
 * CRM that only stores contacts you already have.
 *
 * Copy here tracks the real feature in `src/lib/places/provider.ts` and
 * `app/(app)/leads`: a category + location + radius search over real
 * businesses, results plotted on a map, emails filled in best-effort by
 * `lib/places/enrich.ts` (the Places API does not return them), then a
 * selective import into contacts and companies. There is a second mode that
 * searches people rather than businesses. Keep it honest if the feature moves.
 */

const STEPS = [
  {
    n: "01",
    title: "Search a map, not a database",
    body: "Pick a category and a place, set a radius. Handshake pulls real businesses from inside that circle.",
  },
  {
    n: "02",
    title: "Review what came back",
    body: "Every match with phone, website, address and rating — plus an email discovered from their own site.",
  },
  {
    n: "03",
    title: "Import only what you want",
    body: "Tick the good ones. They land in your CRM as contacts and companies, details already attached.",
  },
];

/** Deterministic pin positions, as % of the map box. */
const PINS = [
  { top: "28%", left: "34%" },
  { top: "44%", left: "58%" },
  { top: "62%", left: "40%" },
  { top: "36%", left: "70%" },
  { top: "70%", left: "62%" },
];

const RESULTS = [
  { name: "Cedar & Co Plumbing", meta: "4.8", city: "Austin, TX" },
  { name: "Lone Star Mechanical", meta: "4.6", city: "Round Rock, TX" },
];

function FinderVisual() {
  return (
    <div
      aria-hidden
      className="app-shot select-none rounded-2xl border border-black/10 bg-background p-3 shadow-2xl"
    >
      {/* Search row */}
      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[11px] font-medium">Plumbers</span>
        <span className="h-3 w-px bg-border" />
        <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[11px] font-medium">Austin, TX</span>
        <span className="ml-auto rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">
          5 km
        </span>
      </div>

      {/* Map with the search radius drawn on it */}
      <div className="relative mt-2 h-40 overflow-hidden rounded-lg border bg-muted">
        {/* street grid */}
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--border) 1px, transparent 1px)," +
              "linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />
        {/* radius */}
        <div className="absolute left-1/2 top-1/2 size-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary/40 bg-primary/10" />
        <div className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-4 ring-primary/20" />
        {/* pins */}
        {PINS.map((p, i) => (
          <span
            key={i}
            className="absolute grid size-5 -translate-x-1/2 -translate-y-full place-items-center rounded-full bg-primary text-primary-foreground shadow"
            style={{ top: p.top, left: p.left }}
          >
            <MapPin className="size-3" strokeWidth={2.5} />
          </span>
        ))}
      </div>

      {/* Results */}
      <div className="mt-2 space-y-1.5">
        {RESULTS.map((r) => (
          <div
            key={r.name}
            className="flex items-center gap-2.5 rounded-lg border bg-card p-2.5 shadow-sm"
          >
            <span className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-primary text-primary-foreground">
              <Check className="size-3" strokeWidth={3} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold">{r.name}</div>
              <div className="mt-0.5 flex items-center gap-2 text-[9px] text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <Star className="size-2.5 fill-amber-400 text-amber-400" />
                  {r.meta}
                </span>
                <span className="truncate">{r.city}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {[Phone, Globe, Mail].map((Icon, i) => (
                <span
                  key={i}
                  className="grid size-5 place-items-center rounded-md bg-muted text-muted-foreground"
                >
                  <Icon className="size-2.5" />
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LeadFinder() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-landing-ink text-landing-cream sm:rounded-[2rem]">
      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.3] mix-blend-overlay" />
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        aria-hidden
        style={{
          background:
            "radial-gradient(60% 55% at 95% 5%, #3b5be0 0%, transparent 60%)",
        }}
      />

      <div className="relative grid items-center gap-10 p-7 sm:p-10 lg:grid-cols-2 lg:gap-14 lg:p-14">
        <div>
          <h3 className="max-w-md font-heading text-3xl font-medium leading-[0.95] tracking-[-0.04em] sm:text-4xl">
            Find your next customer, not just track the ones you have
          </h3>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-landing-cream/60 sm:text-base">
            Most CRMs start working the day after you already found someone.
            Handshake starts a step earlier — search real businesses by category,
            place, and radius, or people by role and company.
          </p>

          <ol className="mt-10 space-y-6">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-4">
                <span className="mt-0.5 text-[11px] tabular-nums tracking-[0.18em] text-landing-cream/35">
                  {s.n}
                </span>
                <div className="border-l border-landing-cream/15 pl-4">
                  <h4 className="font-heading text-base font-medium tracking-[-0.02em]">
                    {s.title}
                  </h4>
                  <p className="mt-1.5 max-w-sm text-sm leading-snug text-landing-cream/60">
                    {s.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <FinderVisual />
      </div>
    </div>
  );
}
