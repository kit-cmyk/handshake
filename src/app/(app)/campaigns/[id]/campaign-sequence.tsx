"use client";

import * as React from "react";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { renderTemplate, SAMPLE_MERGE } from "@/lib/email/template";

export type SequenceStep = {
  id: string;
  subject: string;
  body: string;
  wait_minutes: number;
  sent: number;
};

/** Human-friendly wait label ("waits 3 days") instead of raw minutes. */
function formatWait(minutes: number): string {
  if (minutes <= 0) return "no wait";
  if (minutes % 1440 === 0) {
    const d = minutes / 1440;
    return `waits ${d} day${d === 1 ? "" : "s"}`;
  }
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return `waits ${h} hour${h === 1 ? "" : "s"}`;
  }
  return `waits ${minutes} min`;
}

/**
 * The campaign's sequence, with sends-per-step, and a side sheet that previews
 * each email rendered with sample merge data — mirroring the review step of the
 * create-campaign wizard so the detail page shows the same content.
 */
export function CampaignSequence({ steps }: { steps: SequenceStep[] }) {
  const [active, setActive] = React.useState<SequenceStep | null>(null);

  if (!steps.length)
    return <p className="text-sm text-muted-foreground">No steps yet.</p>;

  return (
    <>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
          >
            <span className="min-w-0">
              <span className="font-medium">Step {i + 1}</span>
              {i > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  · {formatWait(s.wait_minutes)}
                </span>
              )}
              <span className="ml-2 truncate text-muted-foreground">
                {s.subject || "(no subject)"}
              </span>
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="secondary">{s.sent} sent</Badge>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setActive(s)}
              >
                <Eye className="size-4" /> Review email
              </Button>
            </div>
          </li>
        ))}
      </ol>

      <Sheet open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Email preview</SheetTitle>
            <SheetDescription>
              Rendered with sample data ({SAMPLE_MERGE.first_name} at{" "}
              {SAMPLE_MERGE.company}).
            </SheetDescription>
          </SheetHeader>
          {active && (
            <div className="mt-4 rounded-md border">
              <div className="border-b px-3 py-2 text-sm">
                <span className="text-muted-foreground">Subject: </span>
                <span className="font-medium">
                  {renderTemplate(active.subject, SAMPLE_MERGE) || "(no subject)"}
                </span>
              </div>
              <div
                className="prose prose-sm max-w-none px-3 py-3"
                dangerouslySetInnerHTML={{
                  __html:
                    renderTemplate(active.body, SAMPLE_MERGE) ||
                    "<p>(empty body)</p>",
                }}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
