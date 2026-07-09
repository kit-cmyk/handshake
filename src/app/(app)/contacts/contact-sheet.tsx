"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Mail,
  Phone,
  Briefcase,
  Building2,
  MapPin,
  Radio,
  CalendarClock,
  CalendarPlus,
  ExternalLink,
  StickyNote,
  CheckSquare,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LifecycleBadge } from "@/components/lifecycle-badge";
import { ContactForm } from "./contact-form";
import { contactName, formatAddress } from "@/lib/types";
import { getContactProfile, deleteContact, type ContactProfile } from "./actions";

type CompanyOption = { id: string; name: string };

function fmtDate(v: string | null): string {
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

/** Map a campaign/workflow status to a badge variant. */
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

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-lg border bg-card p-4 shadow-sm">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
        {count != null && count > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">
            {count}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

function empty(text: string) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

// Mounted with a `key={contactId}` by the parent, so each contact gets a fresh
// instance: state initializes to "loading" and the fetch only sets state from
// async callbacks (no synchronous setState in the effect body).
export function ContactSheet({
  contactId,
  open,
  onOpenChange,
  companies = [],
  leadSources = [],
}: {
  contactId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companies?: CompanyOption[];
  leadSources?: string[];
}) {
  const router = useRouter();
  const [profile, setProfile] = React.useState<ContactProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState(false);
  // Bumped to re-fetch the profile in place (e.g. after an inline edit).
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    getContactProfile(contactId)
      .then((p) => {
        if (active) setProfile(p);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [contactId, reloadKey]);

  const c = profile?.contact;

  async function handleDelete() {
    await deleteContact(contactId);
    onOpenChange(false);
    router.refresh();
  }

  const details = c
    ? [
        { icon: Mail, label: "Email", value: c.email },
        { icon: Phone, label: "Phone", value: c.phone },
        { icon: Briefcase, label: "Title", value: c.title },
        { icon: Building2, label: "Company", value: c.companies?.name ?? null },
        { icon: Radio, label: "Lead source", value: c.lead_source },
        { icon: MapPin, label: "Address", value: formatAddress(c) || null },
        {
          icon: CalendarClock,
          label: "Appointment",
          value: c.appointment_date ? fmtDate(c.appointment_date) : null,
        },
        {
          icon: CalendarPlus,
          label: "Date added",
          value: fmtDate(c.created_at),
        },
      ]
    : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        {loading || !c ? (
          <div className="space-y-4">
            <div className="h-6 w-40 animate-pulse rounded bg-muted" />
            <div className="h-4 w-56 animate-pulse rounded bg-muted" />
            <div className="h-32 w-full animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-start justify-between gap-3 pr-8">
                <div className="flex items-center gap-3">
                  <SheetTitle>{contactName(c)}</SheetTitle>
                  <LifecycleBadge stage={c.lifecycle_stage} />
                </div>
                {!editing && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(true)}
                    >
                      <Pencil className="size-4" /> Edit
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="size-4" /> Delete
                        </Button>
                      }
                      title="Delete contact?"
                      description={`This permanently deletes ${contactName(
                        c
                      )} and their activity. This can't be undone.`}
                      onConfirm={handleDelete}
                    />
                  </div>
                )}
              </div>
              {!editing && (
                <Link
                  href={`/contacts/${c.id}`}
                  className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="size-3" /> Full page
                </Link>
              )}
            </SheetHeader>

            {editing ? (
              <ContactForm
                contact={c}
                companies={companies}
                leadSources={leadSources}
                onCancel={() => setEditing(false)}
                onSuccess={() => {
                  setEditing(false);
                  setReloadKey((k) => k + 1);
                }}
              />
            ) : (
              <>
            <Section title="Details">
              <dl className="space-y-2 text-sm">
                {details.map((d) => (
                  <div key={d.label} className="flex items-center gap-2">
                    <d.icon className="size-4 shrink-0 text-muted-foreground" />
                    <dt className="w-28 shrink-0 text-muted-foreground">
                      {d.label}
                    </dt>
                    <dd className="flex-1 truncate">{d.value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </Section>

            <Section title="Pipeline" count={profile?.deals.length}>
              {profile?.deals.length ? (
                <ul className="space-y-2">
                  {profile.deals.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{d.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[d.pipeline, d.stage].filter(Boolean).join(" · ") ||
                            "—"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {d.value != null && (
                          <span className="text-xs font-medium">
                            {money(d.value)}
                          </span>
                        )}
                        <Badge variant={statusVariant(d.status)}>
                          {d.status}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                empty("Not linked to any deals.")
              )}
            </Section>

            <Section title="Segments" count={profile?.segments.length}>
              {profile?.segments.length ? (
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

            <Section title="Campaigns" count={profile?.campaigns.length}>
              {profile?.campaigns.length ? (
                <ul className="space-y-2">
                  {profile.campaigns.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{e.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Step {e.current_step + 1} · enrolled{" "}
                          {fmtDate(e.enrolled_at)}
                        </p>
                      </div>
                      <Badge variant={statusVariant(e.status)}>
                        {e.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                empty("Not enrolled in any campaigns.")
              )}
            </Section>

            <Section title="Workflows" count={profile?.workflows.length}>
              {profile?.workflows.length ? (
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
                        {w.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                empty("Not in any workflows.")
              )}
            </Section>

            <Section title="Activity" count={profile?.activities.length}>
              {profile?.activities.length ? (
                <ul className="divide-y">
                  {profile.activities.map((a) => (
                    <li key={a.id} className="flex gap-3 py-2.5 text-sm">
                      <span className="mt-0.5 text-muted-foreground">
                        {a.type === "task" ? (
                          <CheckSquare className="size-4" />
                        ) : (
                          <StickyNote className="size-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="whitespace-pre-wrap">{a.body}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          <span className="capitalize">{a.type}</span> ·{" "}
                          {new Date(a.created_at).toLocaleString()}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                empty("No activity logged yet.")
              )}
            </Section>
              </>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
