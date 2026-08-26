"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FieldError,
  fieldErrorProps,
  errorFor,
} from "@/components/ui/field-error";
import { Combobox } from "@/components/ui/combobox";
import { SheetFooter } from "@/components/ui/sheet";
import { saveCompany, type FormState } from "./actions";
import { DEFAULT_COMPANY_CATEGORIES } from "@/lib/company-categories";
import type { Company } from "@/lib/types";

function Field({
  name,
  label,
  defaultValue,
  type = "text",
  placeholder,
  error,
}: {
  name: string;
  label: string;
  defaultValue?: string | number | null;
  type?: string;
  placeholder?: string;
  /** Validation message for this field, rendered directly beneath it. */
  error?: string;
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
        {...fieldErrorProps(name, !!error)}
      />
      <FieldError id={name}>{error}</FieldError>
    </div>
  );
}

/** Editable company form, shared by the create/edit sheet and the side sheet. */
export function CompanyForm({
  company,
  categories = DEFAULT_COMPANY_CATEGORIES,
  onSuccess,
  onCancel,
}: {
  company?: Company;
  /**
   * Options for the category combobox — built-ins unioned with the org's own,
   * as `listCompanyCategories` returns. Falls back to the built-ins alone.
   */
  categories?: string[];
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveCompany,
    {}
  );
  const [category, setCategory] = React.useState<string>(
    company?.category ?? ""
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
      <input type="hidden" name="category" value={category} />

      <Field name="name" label="Name" defaultValue={company?.name} 
          error={errorFor(state, "name", "name")}
        />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="category">Category (local)</Label>
          <Combobox
            id="category"
            value={category}
            onValueChange={setCategory}
            options={categories}
            placeholder="Select or add a category"
            searchPlaceholder="Search or type to create…"
            emptyText="Type to create a new category."
            allowCreate
          />
          <FieldError id="category">
            {errorFor(state, "category", "name")}
          </FieldError>
        </div>
        <Field
          name="industry"
          label="Industry (B2B)"
          defaultValue={company?.industry}
          placeholder="e.g. SaaS"
        
          error={errorFor(state, "industry", "name")}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field name="website" label="Website" defaultValue={company?.website} 
          error={errorFor(state, "website", "name")}
        />
        <Field
          name="domain"
          label="Domain"
          defaultValue={company?.domain}
          placeholder="acme.com"
        
          error={errorFor(state, "domain", "name")}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field name="phone" label="Phone" defaultValue={company?.phone} 
          error={errorFor(state, "phone", "name")}
        />
        <Field
          name="linkedin_url"
          label="LinkedIn"
          defaultValue={company?.linkedin_url}
        
          error={errorFor(state, "linkedin_url", "name")}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field name="city" label="City" defaultValue={company?.city} 
          error={errorFor(state, "city", "name")}
        />
        <Field name="region" label="Region/State" defaultValue={company?.region} 
          error={errorFor(state, "region", "name")}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          name="employee_count"
          label="Employees"
          type="number"
          defaultValue={company?.employee_count}
        
          error={errorFor(state, "employee_count", "name")}
        />
        <Field
          name="annual_revenue"
          label="Annual revenue"
          defaultValue={company?.annual_revenue}
          placeholder="e.g. 5000000"
        
          error={errorFor(state, "annual_revenue", "name")}
        />
      </div>


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
