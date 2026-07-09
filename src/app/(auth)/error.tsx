"use client";

import { useEffect } from "react";
import Link from "next/link";
import { KeyRound, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusScreen } from "@/components/status-screen";

export default function AuthError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusScreen
      icon={KeyRound}
      title="That didn't go through"
      description="We hit a snag signing you in. Try again, or head back to the login screen."
    >
      <Button onClick={() => unstable_retry()}>
        <RotateCcw className="size-4" /> Try again
      </Button>
      <Link href="/login" className={buttonVariants({ variant: "outline" })}>
        Back to sign in
      </Link>
    </StatusScreen>
  );
}
