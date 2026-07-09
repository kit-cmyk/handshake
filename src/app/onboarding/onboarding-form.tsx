"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
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
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Workspace name</Label>
            <Input
              id="name"
              name="name"
              placeholder="Acme Agency"
              required
            />
          </div>
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
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
