"use client";

import * as React from "react";
import { FileText, Sparkles, Bookmark } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TRIGGER_LABELS } from "@/lib/workflows";
import { WorkflowBuilder } from "../workflow-builder";
import type { EmailSnippet } from "@/components/rich-email-editor";
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "../templates";

type Option = { id: string; name: string };
type MailboxOption = {
  id: string;
  name: string;
  email: string;
  displayName: string | null;
};
const BLANK = "__blank__";

export function NewWorkflow({
  segments,
  campaigns,
  workflows,
  mailboxes,
  userTemplates = [],
  initialTemplate = null,
  emailTemplates,
}: {
  segments: Option[];
  campaigns: Option[];
  workflows: Option[];
  mailboxes: MailboxOption[];
  /** Workflow templates the org saved themselves. */
  userTemplates?: WorkflowTemplate[];
  /** When arriving via ?template=<id>, jump straight into the builder. */
  initialTemplate?: WorkflowTemplate | null;
  /** Email snippets for the send-email node's "Insert template" menu. */
  emailTemplates?: EmailSnippet[];
}) {
  const [chosen, setChosen] = React.useState<WorkflowTemplate | null | undefined>(
    initialTemplate ?? undefined
  );

  if (chosen !== undefined) {
    return (
      <WorkflowBuilder
        template={chosen ?? undefined}
        segments={segments}
        campaigns={campaigns}
        workflows={workflows}
        mailboxes={mailboxes}
        emailTemplates={emailTemplates}
      />
    );
  }

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
          data-blank={BLANK}
        >
          <Card className="h-full transition-colors hover:border-primary">
            <CardContent className="flex items-start gap-3 p-4">
              <FileText className="mt-0.5 size-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Blank workflow</p>
                <p className="text-sm text-muted-foreground">
                  Begin with just a trigger and add your own steps.
                </p>
              </div>
            </CardContent>
          </Card>
        </button>

        {WORKFLOW_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setChosen(t)}
            className="text-left"
          >
            <Card className="h-full transition-colors hover:border-primary">
              <CardContent className="flex items-start gap-3 p-4">
                <Sparkles className="mt-0.5 size-5 text-primary" />
                <div className="space-y-1">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {t.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {TRIGGER_LABELS[t.trigger_type].split(" — ")[0]}
                  </p>
                </div>
              </CardContent>
            </Card>
          </button>
        ))}

        {userTemplates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setChosen(t)}
            className="text-left"
          >
            <Card className="h-full transition-colors hover:border-primary">
              <CardContent className="flex items-start gap-3 p-4">
                <Bookmark className="mt-0.5 size-5 text-muted-foreground" />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{t.name}</p>
                    <Badge variant="outline">Yours</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {TRIGGER_LABELS[t.trigger_type].split(" — ")[0]}
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
