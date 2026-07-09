"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requestPasswordReset } from "../actions";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, {});

  return (
    <Card className="border-none bg-transparent px-0 shadow-none">
      <CardHeader className="px-0">
        <CardTitle className="text-2xl">Reset your password</CardTitle>
        <CardDescription>
          We&apos;ll email you a link to set a new password.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4 px-0">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              required
            />
          </div>
          <div aria-live="polite">
            {state.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            {state.message && (
              <p className="text-sm text-green-600">{state.message}</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 px-0">
          <Button
            type="submit"
            className="btn-brand h-11 w-full"
            disabled={pending}
          >
            {pending ? "Sending…" : "Send reset link"}
          </Button>
          <Link href="/login" className="text-center text-sm underline">
            Back to sign in
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
