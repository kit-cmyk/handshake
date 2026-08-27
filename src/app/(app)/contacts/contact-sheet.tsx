"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LifecycleBadge } from "@/components/lifecycle-badge";
import { ContactForm } from "./contact-form";
import { contactName } from "@/lib/types";
import { getContactProfile, deleteContact, type ContactProfile } from "./actions";
import {
  UnsubscribeNotice,
  DetailsPanel,
  RelationshipPanels,
  ActivityPanel,
} from "./contact-panels";

type CompanyOption = { id: string; name: string };
type OwnerOption = { id: string; name: string };

// Mounted with a `key={contactId}` by the parent, so each contact gets a fresh
// instance: state initializes to "loading" and the fetch only sets state from
// async callbacks (no synchronous setState in the effect body).
export function ContactSheet({
  contactId,
  open,
  onOpenChange,
  companies = [],
  leadSources = [],
  owners = [],
}: {
  contactId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companies?: CompanyOption[];
  leadSources?: string[];
  /** Org members who can own a contact. */
  owners?: OwnerOption[];
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
  const ownerName = c?.owner_id
    ? (owners.find((o) => o.id === c.owner_id)?.name ?? null)
    : null;

  async function handleDelete() {
    await deleteContact(contactId);
    onOpenChange(false);
    router.refresh();
  }

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
                owners={owners}
                onCancel={() => setEditing(false)}
                onSuccess={() => {
                  setEditing(false);
                  setReloadKey((k) => k + 1);
                }}
              />
            ) : (
              <>
            {c.unsubscribed_at && <UnsubscribeNotice at={c.unsubscribed_at} />}

            <DetailsPanel profile={profile!} ownerName={ownerName} />
            <RelationshipPanels profile={profile!} />
            <ActivityPanel
              contactId={contactId}
              profile={profile!}
              onChanged={() => setReloadKey((k) => k + 1)}
            />
              </>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
