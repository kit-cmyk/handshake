import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Globe, Phone, MapPin, Users, Link2 } from "lucide-react";
import { requireContext } from "@/lib/context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { LifecycleBadge } from "@/components/lifecycle-badge";
import { CompanyDialog } from "../company-dialog";
import { DeleteCompanyButton } from "./delete-company-button";
import { contactName, type Company, type Contact } from "@/lib/types";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireContext();

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single();

  if (!company) notFound();

  const { data: contacts } = await supabase
    .from("contacts")
    .select("*")
    .eq("company_id", id)
    .order("created_at", { ascending: false });

  const co = company as Company;
  const people = (contacts ?? []) as Contact[];

  const fields = [
    { icon: Globe, value: co.website ?? co.domain },
    { icon: Phone, value: co.phone },
    {
      icon: MapPin,
      value: [co.city, co.region].filter(Boolean).join(", ") || null,
    },
    { icon: Users, value: co.employee_count ? `${co.employee_count} employees` : null },
    { icon: Link2, value: co.linkedin_url },
  ].filter((f) => f.value);

  return (
    <div className="space-y-6">
      <Link
        href="/companies"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to companies
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{co.name}</h1>
          <p className="text-sm text-muted-foreground">
            {co.industry ?? co.category ?? "Company"}
          </p>
        </div>
        <div className="flex gap-2">
          <CompanyDialog
            company={co}
            trigger={
              <Button variant="outline" size="sm">
                <Pencil className="size-4" /> Edit
              </Button>
            }
          />
          <DeleteCompanyButton id={co.id} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {fields.length ? (
              fields.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <f.icon className="size-4 text-muted-foreground" />
                  <span className="break-all">{f.value}</span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No details yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              Contacts ({people.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {people.length ? (
              <ul className="divide-y">
                {people.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/contacts/${p.id}`}
                      className="flex items-center justify-between py-2.5 hover:text-foreground"
                    >
                      <span className="text-sm font-medium">
                        {contactName(p)}
                      </span>
                      <LifecycleBadge stage={p.lifecycle_stage} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No contacts at this company yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
