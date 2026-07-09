"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Globe,
  Phone,
  MapPin,
  Users,
  DollarSign,
  Star,
  Link2,
  Tag,
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
import { LifecycleBadge } from "@/components/lifecycle-badge";
import { CompanyForm } from "./company-form";
import { getCompanyProfile, deleteCompany, type CompanyProfile } from "./actions";
import { contactName, formatAddress } from "@/lib/types";

function money(v: number | null): string {
  if (v == null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

function statusVariant(
  status: string
): "success" | "warning" | "destructive" | "secondary" | "default" {
  switch (status) {
    case "open":
      return "default";
    case "won":
      return "success";
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

export function CompanySheet({
  companyId,
  open,
  onOpenChange,
}: {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [profile, setProfile] = React.useState<CompanyProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    getCompanyProfile(companyId)
      .then((p) => {
        if (active) setProfile(p);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [companyId, reloadKey]);

  const c = profile?.company;

  async function handleDelete() {
    await deleteCompany(companyId);
    onOpenChange(false);
    router.refresh();
  }

  const details = c
    ? [
        { icon: Tag, value: c.industry ?? c.category },
        { icon: Globe, value: c.website ?? c.domain },
        { icon: Phone, value: c.phone },
        { icon: MapPin, value: formatAddress(c) || null },
        {
          icon: Users,
          value: c.employee_count ? `${c.employee_count} employees` : null,
        },
        { icon: DollarSign, value: c.annual_revenue ? money(c.annual_revenue) : null },
        { icon: Star, value: c.rating != null ? `${c.rating} rating` : null },
        { icon: Link2, value: c.linkedin_url },
      ].filter((f) => f.value)
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
                <div>
                  <SheetTitle>{c.name}</SheetTitle>
                  <p className="text-sm text-muted-foreground">
                    {c.industry ?? c.category ?? "Company"}
                  </p>
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
                      title="Delete company?"
                      description={`This permanently deletes ${c.name}. This can't be undone.`}
                      onConfirm={handleDelete}
                    />
                  </div>
                )}
              </div>
              {!editing && (
                <Link
                  href={`/companies/${c.id}`}
                  className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="size-3" /> Full page
                </Link>
              )}
            </SheetHeader>

            {editing ? (
              <CompanyForm
                company={c}
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
                    {details.length ? (
                      details.map((d, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <d.icon className="size-4 shrink-0 text-muted-foreground" />
                          <dd className="min-w-0 flex-1 break-words">
                            {d.value}
                          </dd>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground">No details yet.</p>
                    )}
                  </dl>
                </Section>

                <Section title="Contacts" count={profile?.contacts.length}>
                  {profile?.contacts.length ? (
                    <ul className="divide-y">
                      {profile.contacts.map((p) => (
                        <li key={p.id}>
                          <Link
                            href={`/contacts/${p.id}`}
                            className="flex items-center justify-between gap-2 py-2 text-sm hover:text-foreground"
                          >
                            <span className="min-w-0 truncate font-medium">
                              {contactName(p)}
                            </span>
                            <LifecycleBadge stage={p.lifecycle_stage} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    empty("No contacts at this company yet.")
                  )}
                </Section>

                <Section title="Deals" count={profile?.deals.length}>
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
                    empty("No deals linked to this company.")
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
