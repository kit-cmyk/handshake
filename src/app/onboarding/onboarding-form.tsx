"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  FieldError,
  fieldErrorProps,
  errorFor,
} from "@/components/ui/field-error";
import { createOrg } from "./actions";

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(createOrg, {});

  return (
    <Card>
      <form action={formAction}>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="full_name">Your name</Label>
            <Input
              id="full_name"
              name="full_name"
              placeholder="Ada Lovelace"
              autoComplete="name"
              {...fieldErrorProps("full_name", !!errorFor(state, "full_name"))}
            />
            <FieldError id="full_name">
              {errorFor(state, "full_name")}
            </FieldError>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Workspace name</Label>
            <Input
              id="name"
              name="name"
              placeholder="Acme Agency"
              required
              {...fieldErrorProps("name", !!errorFor(state, "name", "name"))}
            />
            <FieldError id="name">{errorFor(state, "name", "name")}</FieldError>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating…" : "Create workspace"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
