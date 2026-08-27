"use client";

import { useEffect } from "react";
import { Unplug, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusScreen } from "@/components/status-screen";
import { NavButton } from "@/components/nav-button";

export default function AppError({
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
      icon={Unplug}
      title="We dropped the handshake"
      description="Something broke on our end while loading this page. Give it another go — it usually works the second time."
    >
      <Button onClick={() => unstable_retry()}>
        <RotateCcw className="size-4" /> Try again
      </Button>
      <NavButton to="dashboard" label="Back to dashboard" />
      {error.digest ? (
        <p className="w-full pt-2 text-center font-mono text-xs text-muted-foreground">
          Reference: {error.digest}
        </p>
      ) : null}
    </StatusScreen>
  );
}
