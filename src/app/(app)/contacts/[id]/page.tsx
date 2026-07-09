import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Building2,
  Mail,
  Phone,
  Briefcase,
  MapPin,
  Radio,
  CalendarClock,
  CalendarPlus,
} from "lucide-react";
import { requireContext } from "@/lib/context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { LifecycleBadge } from "@/components/lifecycle-badge";
import { ContactDialog } from "../contact-dialog";
import { ActivityComposer } from "./activity-composer";
import { ActivityItem } from "./activity-item";
import { DeleteContactButton } from "./delete-contact-button";
import { contactName, formatAddress, type Activity, type Contact } from "@/lib/types";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, org } = await requireContext();

  const { data: contact } = await supabase
    .from("contacts")
    .select("*, companies(id, name)")
    .eq("id", id)
    .single();

  if (!contact) notFound();

  const [{ data: activities }, { data: companies }, { data: sources }] =
    await Promise.all([
      supabase
        .from("activities")
        .select("*")
        .eq("contact_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("companies")
        .select("id, name")
        .eq("org_id", org.id)
        .order("name"),
      supabase
        .from("contacts")
        .select("lead_source")
        .eq("org_id", org.id)
        .not("lead_source", "is", null),
    ]);

  const c = contact as Contact & { companies: { id: string; name: string } | null };
  const companyOptions = (companies ?? []) as { id: string; name: string }[];
  const leadSources = [
    ...new Set(
      (sources ?? [])
        .map((s) => (s.lead_source as string | null)?.trim())
        .filter((s): s is string => !!s)
    ),
  ].sort((a, b) => a.localeCompare(b));

  const fmtDate = (v: string | null) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
  };

  const fields = [
    { icon: Mail, label: "Email", value: c.email },
    { icon: Phone, label: "Phone", value: c.phone },
    { icon: Briefcase, label: "Title", value: c.title },
    { icon: Building2, label: "Company", value: c.companies?.name },
    { icon: Radio, label: "Lead source", value: c.lead_source },
    { icon: MapPin, label: "Address", value: formatAddress(c) || null },
    { icon: CalendarClock, label: "Appointment", value: fmtDate(c.appointment_date) },
    { icon: CalendarPlus, label: "Date added", value: fmtDate(c.created_at) },
  ].filter((f) => f.value);

  return (
    <div className="space-y-6">
      <Link
        href="/contacts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to contacts
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {contactName(c)}
          </h1>
          <LifecycleBadge stage={c.lifecycle_stage} />
        </div>
        <div className="flex gap-2">
          <ContactDialog
            companies={companyOptions}
            contact={c}
            leadSources={leadSources}
            trigger={
              <Button variant="outline" size="sm">
                <Pencil className="size-4" /> Edit
              </Button>
            }
          />
          <DeleteContactButton id={c.id} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {fields.length ? (
              fields.map((f) => (
                <div key={f.label} className="flex items-center gap-2">
                  <f.icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="w-24 shrink-0 text-muted-foreground">
                    {f.label}
                  </span>
                  <span className="flex-1">{f.value}</span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No details yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Activity</CardTitle>
            <CardDescription>
              Log notes, calls, tasks, and emails.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ActivityComposer contactId={c.id} />
            <ul className="divide-y">
              {(activities ?? []).length ? (
                (activities as Activity[]).map((a) => (
                  <ActivityItem key={a.id} activity={a} />
                ))
              ) : (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  No activity yet.
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
