import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Building2,
  User,
  CalendarClock,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { DealDialog } from "../deal-dialog";
import { getDealProfile } from "../actions";
import { DeleteDealButton } from "./delete-deal-button";
import { DealQuickActions } from "../deal-quick-actions";
import { DealTimeline } from "../deal-timeline";
import { contactName, DEAL_PRIORITY_LABELS, type DealPriority } from "@/lib/types";

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

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getDealProfile(id);
  if (!profile) notFound();

  const d = profile.deal;
  const contactId = d.contact_id;
  const timeline = profile.timeline;
  const stageList = profile.stages;
  const companyOptions = profile.companies;
  const contactOptions = profile.contacts;

  const details = [
    { icon: Tag, label: "Service", value: d.service },
    {
      icon: Building2,
      label: "Company",
      value: d.companies ? (
        <Link href={`/companies/${d.companies.id}`} className="hover:underline">
          {d.companies.name}
        </Link>
      ) : null,
    },
    {
      icon: User,
      label: "Contact",
      value: d.contacts ? (
        <Link href={`/contacts/${d.contacts.id}`} className="hover:underline">
          {contactName(d.contacts)}
        </Link>
      ) : null,
    },
    {
      icon: CalendarClock,
      label: "Close date",
      value: d.close_date ? new Date(d.close_date).toLocaleDateString() : null,
    },
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/pipeline"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to pipeline
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{d.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xl font-semibold">{money(d.value)}</span>
            <Badge variant={STATUS_VARIANT[d.status]}>{d.status}</Badge>
            <Badge variant={PRIORITY_VARIANT[d.priority]}>
              {DEAL_PRIORITY_LABELS[d.priority]} priority
            </Badge>
            {d.stages?.name && (
              <span className="text-muted-foreground">· {d.stages.name}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <DealDialog
            pipelineId={d.pipeline_id}
            stages={stageList}
            companies={companyOptions}
            contacts={contactOptions}
            deal={d}
            trigger={
              <Button variant="outline" size="sm">
                <Pencil className="size-4" /> Edit
              </Button>
            }
          />
          <DeleteDealButton id={d.id} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {details
                .filter((f) => f.value)
                .map((f) => (
                  <div key={f.label} className="flex items-center gap-2">
                    <f.icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="w-24 shrink-0 text-muted-foreground">
                      {f.label}
                    </span>
                    <span className="flex-1">{f.value}</span>
                  </div>
                ))}
              {d.description && (
                <div className="border-t pt-3">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Description
                  </p>
                  <p className="whitespace-pre-wrap">{d.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick actions</CardTitle>
            </CardHeader>
            <CardContent>
              <DealQuickActions
                dealId={d.id}
                contactId={contactId}
                contactEmail={d.contacts?.email ?? null}
              />
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Timeline</CardTitle>
            <CardDescription>
              Activity, campaigns, workflows, and pipeline moves across this
              deal, its contact, and company.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DealTimeline items={timeline} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
