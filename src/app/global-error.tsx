"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { Unplug, RotateCcw } from "lucide-react";
import "./globals.css";

export default function GlobalError({
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
    // global-error must include its own html and body tags
    <html lang="en" className="h-full antialiased">
      <title>Something went wrong — Handshake</title>
      <body className="min-h-full bg-background text-foreground">
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-16 text-center">
          <span className="animate-hs-float grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-xl shadow-primary/25">
            <Unplug className="size-8" strokeWidth={2} />
          </span>
          <div className="animate-hs-pop space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              The whole thing tripped
            </h1>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Handshake ran into an unexpected error and couldn&apos;t recover
              this page. Reloading usually sorts it out.
            </p>
          </div>
          <button
            onClick={() => unstable_retry()}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <RotateCcw className="size-4" /> Reload
          </button>
          {error.digest ? (
            <p className="font-mono text-xs text-muted-foreground">
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
