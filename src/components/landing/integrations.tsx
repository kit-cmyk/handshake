import { ArrowRight, Handshake, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { CRM_PROVIDERS } from "@/lib/crm/providers";
import { MAILBOX_PROVIDERS } from "@/lib/email/mailbox-providers";
import { BrandGlyph } from "@/app/(app)/settings/brand-mark";

/**
 * Integrations / migration section.
 *
 * The provider lists are read straight from the same registries the product
 * uses (`CRM_PROVIDERS`, `MAILBOX_PROVIDERS`) rather than being retyped here,
 * so the marketing page cannot quietly start advertising a connector that was
 * renamed or removed. Both registries document themselves as free of any
 * Node/fetch/secret code precisely so they can be imported anywhere; only
 * `label`, `type`, and `chip` are read, never the OAuth metadata.
 *
 * `BrandGlyph` renders the vendor mark where one exists and a brand-colored
 * monogram otherwise. On the dark migration panel the CRM marks sit on cream
 * tiles rather than translucent chips: several vendor marks (Pipedrive's above
 * all) are near-black and vanish against the ink.
 */

/**
 * Non-CRM tools, in the order they matter to a switching team. `status` drives
 * the "Soon" badge: Google Calendar is scaffolded in `lib/calendar/provider.ts`
 * but only activates from a single global `GOOGLE_CALENDAR_ACCESS_TOKEN`, and
 * per-user OAuth is still an open item in TODO.md — so there is no self-serve
 * way to connect it yet and it must not be advertised as finished.
 */
const TOOLS: {
  type: string;
  label: string;
  description: string;
  chip: string;
  icon?: typeof CalendarDays;
  status?: "soon";
}[] = [
  ...MAILBOX_PROVIDERS.map((p) => ({
    type: p.type as string,
    label: p.label,
    description: p.description,
    chip: p.chip,
  })),
  {
    type: "google-calendar",
    label: "Google Calendar",
    description: "Book appointments straight onto your calendar from a deal.",
    chip: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    icon: CalendarDays,
    status: "soon",
  },
  {
    type: "slack",
    label: "Slack",
    description: "Get pinged when a lead replies, a deal is won, or a campaign wraps.",
    // Chip and mark both match the Slack card in Settings → Integrations.
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
];

function Glyph({
  type,
  label,
  chip,
  icon: Icon,
  tone = "chip",
}: {
  type: string;
  label: string;
  chip: string;
  icon?: typeof CalendarDays;
  /**
   * "chip" tints the tile with the integration's brand color — right on the
   * light cards. "tile" is a flat cream square for the dark panel, where a
   * tinted-on-ink chip would swallow the darker vendor marks.
   */
  tone?: "chip" | "tile";
}) {
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-xl",
        tone === "tile"
          ? "bg-landing-cream text-landing-ink dark:text-landing-ink"
          : chip,
      )}
    >
      {Icon ? (
        <Icon className="size-4" strokeWidth={2.5} />
      ) : (
        <BrandGlyph type={type} label={label} />
      )}
    </span>
  );
}

export function Integrations() {
  return (
    <div className="space-y-4">
      {/* Migration panel — the CRMs you can leave behind, pointing at Handshake. */}
      <div className="relative overflow-hidden rounded-3xl bg-landing-ink p-7 text-landing-cream sm:rounded-[2rem] sm:p-10">
        <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.3] mix-blend-overlay" />
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            background:
              "radial-gradient(70% 60% at 90% 10%, #3b5be0 0%, transparent 60%)",
          }}
        />

        <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_auto_auto] lg:gap-10">
          {/* Where your data lives today */}
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-landing-cream/45">
              Your CRM today
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CRM_PROVIDERS.map((p) => (
                <div
                  key={p.type}
                  className="flex items-center gap-2.5 rounded-xl border border-landing-cream/12 bg-landing-cream/[0.06] px-3 py-2.5"
                >
                  <Glyph
                    type={p.type}
                    label={p.label}
                    chip={p.chip}
                    tone="tile"
                  />
                  <span className="min-w-0 truncate text-xs font-medium text-landing-cream/80">
                    {p.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Arrow — rotates to point down once the layout stacks. */}
          <div
            aria-hidden
            className="flex justify-center lg:justify-start"
          >
            <span className="grid size-11 place-items-center rounded-full border border-landing-cream/20 bg-landing-cream/10">
              <ArrowRight className="size-5 rotate-90 text-landing-cream/70 lg:rotate-0" />
            </span>
          </div>

          {/* Destination */}
          <div className="lg:max-w-[15rem]">
            <p className="text-[11px] uppercase tracking-[0.18em] text-landing-cream/45">
              Handshake
            </p>
            <div className="mt-4 flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-landing-cream text-landing-ink">
                <Handshake className="size-5" strokeWidth={2.5} />
              </span>
              <p className="text-sm leading-snug text-landing-cream/70">
                Contacts, companies, and details — imported and kept in sync.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Everything else your team already lives in. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TOOLS.map((t) => (
          <div
            key={t.type}
            className="flex flex-col gap-3 rounded-3xl border bg-card p-6 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <Glyph type={t.type} label={t.label} chip={t.chip} icon={t.icon} />
              {t.status === "soon" && (
                <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Soon
                </span>
              )}
            </div>
            <div>
              <h3 className="font-heading text-base font-medium tracking-[-0.02em]">
                {t.label}
              </h3>
              <p className="mt-1.5 text-sm leading-snug text-muted-foreground">
                {t.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
