import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireContext } from "@/lib/context";
import { Button } from "@/components/ui/button";
import { LifecycleBadge } from "@/components/lifecycle-badge";
import { ContactDialog } from "../contact-dialog";
import { DeleteContactButton } from "./delete-contact-button";
import { getContactProfile } from "../actions";
import {
  UnsubscribeNotice,
  DetailsPanel,
  RelationshipPanels,
  ActivityPanel,
} from "../contact-panels";
import { contactName } from "@/lib/types";

/**
 * Full contact record.
 *
 * Reads the same `getContactProfile` payload the side sheet uses and renders
 * the same panels, so the two views cannot drift apart again — this page used
 * to show only details and activity, which made the sheet's "Full page" link
 * lead somewhere strictly less informative than where it started.
 */
export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, org } = await requireContext();

  const profile = await getContactProfile(id);
  if (!profile) notFound();

  const [{ data: companies }, { data: sources }, { data: members }] =
    await Promise.all([
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
      supabase
        .from("memberships")
        .select("user_id, profiles(full_name, email)")
        .eq("org_id", org.id),
    ]);

  const c = profile.contact;
  const companyOptions = (companies ?? []) as { id: string; name: string }[];
  const leadSources = [
    ...new Set(
      (sources ?? [])
        .map((s) => (s.lead_source as string | null)?.trim())
        .filter((s): s is string => !!s)
    ),
  ].sort((a, b) => a.localeCompare(b));

  const ownerOptions = (members ?? []).map((m) => {
    const row = m as unknown as {
      user_id: string;
      profiles:
        | { full_name: string | null; email: string | null }
        | { full_name: string | null; email: string | null }[]
        | null;
    };
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.user_id,
      name: p?.full_name?.trim() || p?.email || "Unknown member",
    };
  });
  ownerOptions.sort((a, b) => a.name.localeCompare(b.name));
  const ownerName = c.owner_id
    ? (ownerOptions.find((o) => o.id === c.owner_id)?.name ?? null)
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        back="contacts"
        title={contactName(c)}
        badge={<LifecycleBadge stage={c.lifecycle_stage} />}
        actions={
          <>
            <ContactDialog
              companies={companyOptions}
              contact={c}
              leadSources={leadSources}
              owners={ownerOptions}
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil className="size-4" /> Edit
                </Button>
              }
            />
            <DeleteContactButton id={c.id} />
          </>
        }
      />

      {c.unsubscribed_at && <UnsubscribeNotice at={c.unsubscribed_at} />}

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <DetailsPanel profile={profile} ownerName={ownerName} />
          <RelationshipPanels profile={profile} />
        </div>

        <div className="lg:col-span-2">
          <ActivityPanel contactId={c.id} profile={profile} />
        </div>
      </div>
    </div>
  );
}
