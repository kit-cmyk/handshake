"use client";

import * as React from "react";
import {
  Mail,
  Phone,
  Briefcase,
  Building2,
  MapPin,
  Radio,
  CalendarClock,
  CalendarPlus,
  UserRound,
  BellOff,
  Link2,
} from "lucide-react";
import { Badge, CountBadge } from "@/components/ui/badge";
import { formatAddress } from "@/lib/types";
import type { ContactProfile } from "./actions";
import { ActivityComposer } from "./[id]/activity-composer";
import { ActivityItem } from "./[id]/activity-item";
import { statusLabel } from "@/lib/utils";

/**
 * The contact record's panels, shared by the side sheet and the full page.
 *
 * These two views had drifted badly apart: the sheet showed deals, segments,
 * campaigns and workflows but could not log activity, while the full page could
 * log activity but showed none of those relationships — so the sheet's "Full
 * page" link led somewhere strictly less informative. Rendering both from one
 * component is what stops that happening again.
 */

export function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function money(v: number | null): string {
  if (v == null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

/** Map a campaign/workflow/deal status to a badge variant. */
function statusVariant(
  status: string
): "success" | "warning" | "destructive" | "secondary" | "default" {
  switch (status) {
    case "active":
      return "default";
    case "completed":
    case "replied":
    case "won":
      return "success";
    case "paused":
      return "warning";
    case "bounced":
    case "unsubscribed":
    case "failed":
    case "lost":
      return "destructive";
    default:
      return "secondary";
  }
}

export function Section({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
          {count != null && count > 0 && <CountBadge count={count} />}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function empty(text: string) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

/**
 * Opting out is enforced silently by the enrollment engine
 * (`lib/campaigns/enroll.ts` drops these contacts), so it has to be stated on
 * the record — otherwise a rep just sees a campaign that never arrived.
 */
export function UnsubscribeNotice({ at }: { at: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
      <BellOff className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div>
        <p className="font-medium text-destructive">
          Unsubscribed on {fmtDate(at)}
        </p>
        <p className="mt-0.5 text-muted-foreground">
          They are excluded from every campaign and workflow email. You can
          still call, log activity, and work their deals.
        </p>
      </div>
    </div>
  );
}

/** `https://www.linkedin.com/in/jane-doe` → `in/jane-doe` — the URL is too long
 * for the details column and the slug is the part that identifies the person. */
function linkedinLabel(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\/|\/$/g, "") || url;
  } catch {
    return url;
  }
}

export function DetailsPanel({
  profile,
  ownerName,
}: {
  profile: ContactProfile;
  ownerName?: string | null;
}) {
  const c = profile.contact;
  const details: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string | null;
    /** Renders the value as a link out when set. */
    href?: string | null;
  }[] = [
    { icon: Mail, label: "Email", value: c.email },
    { icon: Phone, label: "Phone", value: c.phone },
    { icon: Briefcase, label: "Title", value: c.title },
    {
      icon: Link2,
      label: "LinkedIn",
      value: c.linkedin_url ? linkedinLabel(c.linkedin_url) : null,
      href: c.linkedin_url,
    },
    { icon: Building2, label: "Company", value: c.companies?.name ?? null },
    { icon: UserRound, label: "Owner", value: ownerName ?? null },
    { icon: Radio, label: "Lead source", value: c.lead_source },
    { icon: MapPin, label: "Address", value: formatAddress(c) || null },
    {
      icon: CalendarClock,
      label: "Appointment",
      value: c.appointment_date ? fmtDate(c.appointment_date) : null,
    },
    { icon: CalendarPlus, label: "Date added", value: fmtDate(c.created_at) },
  ];

  return (
    <Section title="Details">
      <dl className="space-y-2 text-sm">
        {details.map((d) => (
          <div key={d.label} className="flex items-center gap-2">
            <d.icon className="size-4 shrink-0 text-muted-foreground" />
            <dt className="w-28 shrink-0 text-muted-foreground">{d.label}</dt>
            <dd className="flex-1 truncate">
              {!d.value ? (
                <span className="text-muted-foreground">
                  {d.label === "Owner" ? "Unassigned" : "—"}
                </span>
              ) : d.href ? (
                <a
                  href={d.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {d.value}
                </a>
              ) : (
                d.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

/** Deals, segments, campaigns and workflows — everything the contact is tied to. */
export function RelationshipPanels({ profile }: { profile: ContactProfile }) {
  return (
    <>
      <Section title="Pipeline" count={profile.deals.length}>
        {profile.deals.length ? (
          <ul className="space-y-2">
            {profile.deals.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[d.pipeline, d.stage].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {d.value != null && (
                    <span className="text-xs font-medium">{money(d.value)}</span>
                  )}
                  <Badge variant={statusVariant(d.status)}>
                    {statusLabel(d.status)}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          empty("Not linked to any deals.")
        )}
      </Section>

      <Section title="Segments" count={profile.segments.length}>
        {profile.segments.length ? (
          <div className="flex flex-wrap gap-1.5">
            {profile.segments.map((s) => (
              <Badge key={s.id} variant="outline">
                {s.name}
                <span className="ml-1 text-muted-foreground">
                  {s.type === "dynamic" ? "·dyn" : "·static"}
                </span>
              </Badge>
            ))}
          </div>
        ) : (
          empty("Not in any segments.")
        )}
      </Section>

      <Section title="Campaigns" count={profile.campaigns.length}>
        {profile.campaigns.length ? (
          <ul className="space-y-2">
            {profile.campaigns.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{e.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Step {e.current_step + 1} · enrolled {fmtDate(e.enrolled_at)}
                  </p>
                </div>
                <Badge variant={statusVariant(e.status)}>
                  {statusLabel(e.status)}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          empty("Not enrolled in any campaigns.")
        )}
      </Section>

      <Section title="Workflows" count={profile.workflows.length}>
        {profile.workflows.length ? (
          <ul className="space-y-2">
            {profile.workflows.map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{w.name}</p>
                  <p className="text-xs text-muted-foreground">
                    started {fmtDate(w.started_at)}
                  </p>
                </div>
                <Badge variant={statusVariant(w.status)}>
                  {statusLabel(w.status)}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          empty("Not in any workflows.")
        )}
      </Section>
    </>
  );
}

/**
 * Activity, with the composer and per-item controls.
 *
 * `onChanged` exists for the side sheet: the composer and items call
 * `router.refresh()`, which re-renders server components but does nothing for
 * the sheet's client-side `getContactProfile` fetch. The sheet passes a
 * callback to re-fetch; the full page is server-rendered and needs nothing.
 */
export function ActivityPanel({
  contactId,
  profile,
  onChanged,
}: {
  contactId: string;
  profile: ContactProfile;
  onChanged?: () => void;
}) {
  return (
    <Section
      title="Activity"
      count={profile.activities.length}
      action={<ActivityComposer contactId={contactId} onSaved={onChanged} />}
    >
      {profile.activities.length ? (
        <ul className="divide-y">
          {profile.activities.map((a) => (
            <ActivityItem key={a.id} activity={a} onChanged={onChanged} />
          ))}
        </ul>
      ) : (
        empty("No activity logged yet.")
      )}
    </Section>
  );
}
