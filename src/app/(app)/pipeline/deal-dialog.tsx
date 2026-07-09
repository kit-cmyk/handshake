"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveDeal, type FormState } from "./actions";
import {
  DEAL_PRIORITIES,
  DEAL_PRIORITY_LABELS,
  type Deal,
  type DealPriority,
  type Stage,
} from "@/lib/types";

type Option = { id: string; name: string };
type ContactOption = { id: string; name: string; companyId: string | null };
const NONE = "none";

export function DealDialog({
  pipelineId,
  stages,
  companies,
  contacts,
  deal,
  defaultStageId,
  trigger,
  onSaved,
}: {
  pipelineId: string;
  stages: Stage[];
  companies: Option[];
  contacts: ContactOption[];
  deal?: Deal;
  defaultStageId?: string;
  trigger: React.ReactNode;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveDeal,
    {}
  );
  const [stageId, setStageId] = React.useState(
    deal?.stage_id ?? defaultStageId ?? stages[0]?.id ?? ""
  );
  const [companyId, setCompanyId] = React.useState(deal?.company_id ?? NONE);
  const [contactId, setContactId] = React.useState(deal?.contact_id ?? NONE);
  const [priority, setPriority] = React.useState<DealPriority>(
    deal?.priority ?? "medium"
  );
  // Tracks whether the current company was auto-filled from the contact, so we
  // can follow contact changes without clobbering a manual company choice.
  const companyAutoFilled = React.useRef(false);

  React.useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
      onSaved?.();
    }
  }, [state, router, onSaved]);

  function handleContactChange(value: string) {
    setContactId(value);
    const linkedCompany =
      value === NONE
        ? null
        : (contacts.find((c) => c.id === value)?.companyId ?? null);
    // Autofill the company from the contact's linked company, unless the user
    // has manually picked one.
    if (linkedCompany && (companyId === NONE || companyAutoFilled.current)) {
      setCompanyId(linkedCompany);
      companyAutoFilled.current = true;
    }
  }

  function handleCompanyChange(value: string) {
    setCompanyId(value);
    companyAutoFilled.current = false;
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{deal ? "Edit deal" : "New deal"}</SheetTitle>
        </SheetHeader>
        <form action={formAction} className="space-y-4">
          {deal && <input type="hidden" name="id" value={deal.id} />}
          <input type="hidden" name="pipeline_id" value={pipelineId} />
          <input type="hidden" name="stage_id" value={stageId} />
          <input type="hidden" name="company_id" value={companyId === NONE ? "" : companyId} />
          <input type="hidden" name="contact_id" value={contactId === NONE ? "" : contactId} />
          <input type="hidden" name="priority" value={priority} />

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              defaultValue={deal?.title ?? ""}
              placeholder="e.g. Website redesign — Acme"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="value">Value</Label>
              <Input
                id="value"
                name="value"
                defaultValue={deal?.value ?? ""}
                placeholder="5000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="close_date">Close date</Label>
              <DatePicker
                id="close_date"
                name="close_date"
                defaultValue={deal?.close_date ?? ""}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="service">Service</Label>
              <Input
                id="service"
                name="service"
                defaultValue={deal?.service ?? ""}
                placeholder="e.g. Website redesign"
              />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as DealPriority)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEAL_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {DEAL_PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Stage</Label>
            <Select value={stageId} onValueChange={setStageId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            Link this deal to a company, a contact, or both.
          </p>

          <div className="space-y-2">
            <Label>Company</Label>
            <Select value={companyId} onValueChange={handleCompanyChange}>
              <SelectTrigger>
                <SelectValue placeholder="No company" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No company</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Contact</Label>
            <Select value={contactId} onValueChange={handleContactChange}>
              <SelectTrigger>
                <SelectValue placeholder="No contact" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No contact</SelectItem>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={deal?.description ?? ""}
              placeholder="Notes about scope, next steps, context…"
              rows={4}
            />
          </div>

          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <SheetFooter>
            <Button
              type="submit"
              disabled={pending || (companyId === NONE && contactId === NONE)}
            >
              {pending ? "Saving…" : deal ? "Save changes" : "Create deal"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
