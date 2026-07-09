"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SheetFooter } from "@/components/ui/sheet";
import { saveCompany, type FormState } from "./actions";
import type { Company } from "@/lib/types";

function Field({
  name,
  label,
  defaultValue,
  type = "text",
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue?: string | number | null;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
      />
    </div>
  );
}

/** Editable company form, shared by the create/edit sheet and the side sheet. */
export function CompanyForm({
  company,
  onSuccess,
  onCancel,
}: {
  company?: Company;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveCompany,
    {}
  );

  React.useEffect(() => {
    if (state.ok) {
      router.refresh();
      onSuccess?.();
    }
  }, [state, router, onSuccess]);

  return (
    <form action={formAction} className="space-y-4">
      {company && <input type="hidden" name="id" value={company.id} />}

      <Field name="name" label="Name" defaultValue={company?.name} />

      <div className="grid grid-cols-2 gap-3">
        <Field
          name="category"
          label="Category (local)"
          defaultValue={company?.category}
          placeholder="e.g. Dentist"
        />
        <Field
          name="industry"
          label="Industry (B2B)"
          defaultValue={company?.industry}
          placeholder="e.g. SaaS"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field name="website" label="Website" defaultValue={company?.website} />
        <Field
          name="domain"
          label="Domain"
          defaultValue={company?.domain}
          placeholder="acme.com"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field name="phone" label="Phone" defaultValue={company?.phone} />
        <Field
          name="linkedin_url"
          label="LinkedIn"
          defaultValue={company?.linkedin_url}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field name="city" label="City" defaultValue={company?.city} />
        <Field name="region" label="Region/State" defaultValue={company?.region} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          name="employee_count"
          label="Employees"
          type="number"
          defaultValue={company?.employee_count}
        />
        <Field
          name="annual_revenue"
          label="Annual revenue"
          defaultValue={company?.annual_revenue}
          placeholder="e.g. 5000000"
        />
      </div>

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
          {pending ? "Saving…" : company ? "Save changes" : "Create company"}
        </Button>
      </SheetFooter>
    </form>
  );
}
