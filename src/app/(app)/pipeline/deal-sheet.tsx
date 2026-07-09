"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Tag,
  Building2,
  User,
  Mail,
  CalendarClock,
  ExternalLink,
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
import { DealDialog } from "./deal-dialog";
import { DealQuickActions } from "./deal-quick-actions";
import { DealTimeline } from "./deal-timeline";
import { getDealProfile, deleteDeal, type DealProfile } from "./actions";
import {
  contactName,
  DEAL_PRIORITY_LABELS,
  type DealPriority,
} from "@/lib/types";

function money(v: number | null): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

const STATUS_VARIANT = {
  open: "default",
  won: "success",
  lost: "destructive",
} as const;

const PRIORITY_VARIANT: Record<
  DealPriority,
  "secondary" | "warning" | "destructive"
> = {
  low: "secondary",
  medium: "warning",
  high: "destructive",
};

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DealSheet({
  dealId,
  open,
  onOpenChange,
}: {
  dealId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [profile, setProfile] = React.useState<DealProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    getDealProfile(dealId)
      .then((p) => {
        if (active) setProfile(p);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dealId, reloadKey]);

  const d = profile?.deal;

  async function handleDelete() {
    await deleteDeal(dealId);
    onOpenChange(false);
    router.refresh();
  }

  const details = d
    ? [
        { icon: Tag, label: "Service", value: d.service },
        {
          icon: Building2,
          label: "Company",
          value: d.companies ? (
            <Link
              href={`/companies/${d.companies.id}`}
              className="hover:underline"
            >
              {d.companies.name}
            </Link>
          ) : null,
        },
        {
          icon: User,
          label: "Contact",
          value: d.contacts ? (
            <Link
              href={`/contacts/${d.contacts.id}`}
              className="hover:underline"
            >
              {contactName(d.contacts)}
            </Link>
          ) : null,
        },
        { icon: Mail, label: "Email", value: d.contacts?.email ?? null },
        {
          icon: CalendarClock,
          label: "Close date",
          value: d.close_date
            ? new Date(d.close_date).toLocaleDateString()
            : null,
        },
      ].filter((f) => f.value)
    : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        {loading || !d ? (
          <div className="space-y-4">
            <div className="h-6 w-40 animate-pulse rounded bg-muted" />
            <div className="h-4 w-56 animate-pulse rounded bg-muted" />
            <div className="h-32 w-full animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-start justify-between gap-3 pr-8">
                <div className="space-y-1">
                  <SheetTitle>{d.title}</SheetTitle>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-lg font-semibold">
                      {money(d.value)}
                    </span>
                    <Badge variant={STATUS_VARIANT[d.status]}>{d.status}</Badge>
                    <Badge variant={PRIORITY_VARIANT[d.priority]}>
                      {DEAL_PRIORITY_LABELS[d.priority]}
                    </Badge>
                    {d.stages?.name && (
                      <span className="text-muted-foreground">
                        · {d.stages.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <DealDialog
                    pipelineId={d.pipeline_id}
                    stages={profile!.stages}
                    companies={profile!.companies}
                    contacts={profile!.contacts}
                    deal={d}
                    onSaved={() => setReloadKey((k) => k + 1)}
                    trigger={
                      <Button variant="outline" size="sm">
                        <Pencil className="size-4" /> Edit
                      </Button>
                    }
                  />
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
                    title="Delete deal?"
                    description={`This permanently deletes "${d.title}" and its timeline. This can't be undone.`}
                    onConfirm={handleDelete}
                  />
                </div>
              </div>
              <Link
                href={`/pipeline/${d.id}`}
                className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3" /> Open full page
              </Link>
            </SheetHeader>

            {/* Quick actions */}
            <DealQuickActions
              dealId={d.id}
              contactId={d.contact_id}
              contactEmail={d.contacts?.email ?? null}
              onChange={() => setReloadKey((k) => k + 1)}
            />

            <Section title="Details">
              <dl className="space-y-2 text-sm">
                {details.map((f) => (
                  <div key={f.label} className="flex items-center gap-2">
                    <f.icon className="size-4 shrink-0 text-muted-foreground" />
                    <dt className="w-20 shrink-0 text-muted-foreground">
                      {f.label}
                    </dt>
                    <dd className="min-w-0 flex-1 truncate">{f.value}</dd>
                  </div>
                ))}
              </dl>
              {d.description && (
                <p className="whitespace-pre-wrap border-t pt-2 text-sm">
                  {d.description}
                </p>
              )}
            </Section>

            <Section title="Timeline">
              <DealTimeline items={profile!.timeline} />
            </Section>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
