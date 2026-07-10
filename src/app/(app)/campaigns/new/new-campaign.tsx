"use client";

import * as React from "react";
import { FileText, Sparkles, Bookmark, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CampaignWizard } from "../campaign-wizard";
import type { EmailSnippet } from "@/components/rich-email-editor";
import type { ContactOption } from "../contact-options";
import type { CampaignStep } from "@/lib/types";
import type { CampaignTemplate } from "@/lib/templates/types";

type Option = { id: string; name: string };
type SegmentOption = Option & { type?: "static" | "dynamic"; count?: number };

/** Turn a template's steps into the synthetic CampaignStep[] the wizard seeds
 *  from. Empty ids mark them as new (create, not edit). */
function toSeedSteps(t: CampaignTemplate): CampaignStep[] {
  return t.content.steps.map((s, i) => ({
    id: "",
    org_id: "",
    campaign_id: "",
    position: i,
    channel: "email",
    subject: s.subject,
    body: s.body,
    wait_minutes: s.wait_minutes,
    stop_on_reply: s.stop_on_reply,
    created_at: "",
  }));
}

function humanWait(minutes: number): string {
  if (!minutes) return "starts immediately";
  if (minutes % 1440 === 0) return `+${minutes / 1440}d`;
  if (minutes % 60 === 0) return `+${minutes / 60}h`;
  return `+${minutes}m`;
}

export function NewCampaign({
  templates,
  initialTemplate,
  segments,
  mailboxes,
  contacts,
  defaultTestEmail,
  emailTemplates,
}: {
  templates: CampaignTemplate[];
  initialTemplate?: CampaignTemplate | null;
  segments: SegmentOption[];
  mailboxes: Option[];
  contacts: ContactOption[];
  defaultTestEmail?: string | null;
  emailTemplates?: EmailSnippet[];
}) {
  // undefined = still choosing; null = blank; a template = seed the wizard.
  const [chosen, setChosen] = React.useState<
    CampaignTemplate | null | undefined
  >(initialTemplate ?? undefined);

  if (chosen !== undefined) {
    return (
      <CampaignWizard
        segments={segments}
        mailboxes={mailboxes}
        contacts={contacts}
        defaultTestEmail={defaultTestEmail}
        steps={chosen ? toSeedSteps(chosen) : undefined}
        initialName={chosen?.name}
        initialStopOnReply={chosen?.content.stop_on_reply}
        emailTemplates={emailTemplates}
      />
    );
  }

  const curated = templates.filter((t) => t.source === "curated");
  const yours = templates.filter((t) => t.source === "org");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Start from a template or build from scratch.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setChosen(null)}
          className="text-left"
        >
          <Card className="h-full transition-colors hover:border-primary">
            <CardContent className="flex items-start gap-3 p-4">
              <FileText className="mt-0.5 size-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Blank campaign</p>
                <p className="text-sm text-muted-foreground">
                  Start with a single empty step and build your own sequence.
                </p>
              </div>
            </CardContent>
          </Card>
        </button>

        {[...curated, ...yours].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setChosen(t)}
            className="text-left"
          >
            <Card className="h-full transition-colors hover:border-primary">
              <CardContent className="flex items-start gap-3 p-4">
                {t.source === "curated" ? (
                  <Sparkles className="mt-0.5 size-5 text-primary" />
                ) : (
                  <Bookmark className="mt-0.5 size-5 text-muted-foreground" />
                )}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{t.name}</p>
                    {t.source === "org" && <Badge variant="outline">Yours</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t.description}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    {t.content.steps.length} step
                    {t.content.steps.length === 1 ? "" : "s"} ·{" "}
                    {t.content.steps
                      .map((s) => humanWait(s.wait_minutes))
                      .join(", ")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
