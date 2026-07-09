"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { resendConfirmation } from "../actions";

export function ResendEmail({ email }: { email: string }) {
  const [state, action, pending] = useActionState(resendConfirmation, {});

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="email" value={email} />
      <Button
        type="submit"
        variant="outline"
        className="w-full"
        disabled={pending || !email}
      >
        {pending ? "Sending…" : "Resend verification email"}
      </Button>
      <div aria-live="polite">
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        {state.message && (
          <p className="text-sm text-green-600">{state.message}</p>
        )}
      </div>
    </form>
  );
}
