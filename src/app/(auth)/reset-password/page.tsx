"use client";

import * as React from "react";
import { useActionState } from "react";
import { Eye, EyeOff } from "lucide-react";
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
import { updatePassword } from "../actions";

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(updatePassword, {});
  const [showPw, setShowPw] = React.useState(false);

  return (
    <Card className="border-none bg-transparent px-0 shadow-none">
      <CardHeader className="px-0">
        <CardTitle className="text-2xl">Set a new password</CardTitle>
        <CardDescription>Choose a strong password you don&apos;t reuse.</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4 px-0">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                minLength={6}
                required
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              name="confirm"
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>
          <div aria-live="polite">
            {state.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="px-0">
          <Button
            type="submit"
            className="btn-brand h-11 w-full"
            disabled={pending}
          >
            {pending ? "Saving…" : "Update password"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
