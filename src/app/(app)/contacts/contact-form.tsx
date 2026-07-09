"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { SheetFooter } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { saveContact, type FormState } from "./actions";
import {
  LIFECYCLE_STAGES,
  LIFECYCLE_LABELS,
  type Contact,
  type LifecycleStage,
} from "@/lib/types";
import { COUNTRIES } from "@/lib/countries";

type CompanyOption = { id: string; name: string };

const NONE = "none";

/**
 * The editable contact form. Used both inside the create/edit sheet
 * (`ContactDialog`) and inline within the contact side sheet.
 */
export function ContactForm({
  contact,
  companies,
  leadSources = [],
  onSuccess,
  onCancel,
}: {
  contact?: Contact;
  companies: CompanyOption[];
  leadSources?: string[];
  /** Fired after a successful save (router.refresh already ran). */
  onSuccess?: () => void;
  /** When provided, renders a Cancel button. */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveContact,
    {}
  );
  const [companyId, setCompanyId] = React.useState<string>(
    contact?.company_id ?? NONE
  );
  const [stage, setStage] = React.useState<LifecycleStage>(
    contact?.lifecycle_stage ?? "new"
  );
  const [leadSource, setLeadSource] = React.useState<string>(
    contact?.lead_source ?? ""
  );
  const [country, setCountry] = React.useState<string>(contact?.country ?? "");

  React.useEffect(() => {
    if (state.ok) {
      router.refresh();
      onSuccess?.();
    }
  }, [state, router, onSuccess]);

  return (
    <form action={formAction} className="space-y-4">
      {contact && <input type="hidden" name="id" value={contact.id} />}
      <input
        type="hidden"
        name="company_id"
        value={companyId === NONE ? "" : companyId}
      />
      <input type="hidden" name="lifecycle_stage" value={stage} />
      <input type="hidden" name="lead_source" value={leadSource} />
      <input type="hidden" name="country" value={country} />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="first_name">First name</Label>
          <Input
            id="first_name"
            name="first_name"
            defaultValue={contact?.first_name ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="last_name">Last name</Label>
          <Input
            id="last_name"
            name="last_name"
            defaultValue={contact?.last_name ?? ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={contact?.email ?? ""}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={contact?.phone ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" defaultValue={contact?.title ?? ""} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Company</Label>
        <Select value={companyId} onValueChange={setCompanyId}>
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
        <Label>Lifecycle</Label>
        <Select value={stage} onValueChange={(v) => setStage(v as LifecycleStage)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LIFECYCLE_STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {LIFECYCLE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="lead_source">Lead source</Label>
        <Combobox
          id="lead_source"
          value={leadSource}
          onValueChange={setLeadSource}
          options={leadSources}
          placeholder="Select or add a lead source"
          searchPlaceholder="Search or type to create…"
          emptyText="Type to create a new lead source."
          allowCreate
        />
      </div>

      <div className="space-y-2">
        <Label>Address</Label>
        <div className="space-y-2">
          <Input
            name="address"
            placeholder="Street address"
            defaultValue={contact?.address ?? ""}
          />
          <Input
            name="address_line2"
            placeholder="Apt, suite, unit (optional)"
            defaultValue={contact?.address_line2 ?? ""}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              name="city"
              placeholder="City"
              defaultValue={contact?.city ?? ""}
            />
            <Input
              name="region"
              placeholder="State / province / region"
              defaultValue={contact?.region ?? ""}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              name="postal_code"
              placeholder="ZIP / postal code"
              defaultValue={contact?.postal_code ?? ""}
            />
            <Combobox
              value={country}
              onValueChange={setCountry}
              options={COUNTRIES}
              placeholder="Country"
              searchPlaceholder="Search countries…"
              emptyText="No country found."
            />
          </div>
        </div>
      </div>

      {/* Appointment date is set after the contact exists, so it's only
          editable when editing — never on the create form. */}
      {contact && (
        <div className="space-y-2">
          <Label htmlFor="appointment_date">Appointment date</Label>
          <DatePicker
            id="appointment_date"
            name="appointment_date"
            defaultValue={contact.appointment_date ?? ""}
          />
        </div>
      )}

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <SheetFooter>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : contact ? "Save changes" : "Create contact"}
        </Button>
      </SheetFooter>
    </form>
  );
}
