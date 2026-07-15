"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Mail,
  Send,
  Workflow as WorkflowIcon,
  Sparkles,
  Eye,
  Trash2,
  ArrowRight,
  Clock,
  Copy,
  Check,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { renderTemplate, SAMPLE_MERGE } from "@/lib/email/template";
import { ACTION_LABELS, type ActionType } from "@/lib/workflows";
import {
  TEMPLATE_KINDS,
  TEMPLATE_KIND_LABELS,
  isCampaignTemplate,
  isEmailTemplate,
  isWorkflowTemplate,
  type Template,
  type TemplateKind,
} from "@/lib/templates/types";
import { deleteTemplate } from "./actions";

const KIND_ICON: Record<TemplateKind, LucideIcon> = {
  email: Mail,
  campaign: Send,
  workflow: WorkflowIcon,
};

function humanWait(minutes: number): string {
  if (!minutes) return "immediately";
  if (minutes % 1440 === 0) return `after ${minutes / 1440}d`;
  if (minutes % 60 === 0) return `after ${minutes / 60}h`;
  return `after ${minutes}m`;
}

export function TemplatesBrowser({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [preview, setPreview] = React.useState<Template | null>(null);
  const [deleting, setDeleting] = React.useState<string | null>(null);

  const byKind = (kind: TemplateKind) =>
    templates.filter((t) => t.kind === kind);

  function use(t: Template) {
    if (isWorkflowTemplate(t)) router.push(`/workflows/new?template=${t.id}`);
    else if (isCampaignTemplate(t))
      router.push(`/campaigns/new?template=${t.id}`);
    else setPreview(t); // emails are inserted from within editors
  }

  async function remove(id: string) {
    setDeleting(id);
    await deleteTemplate(id);
    setDeleting(null);
    router.refresh();
  }

  return (
    <>
      <Tabs defaultValue="email">
        <TabsList>
          {TEMPLATE_KINDS.map((k) => {
            const Icon = KIND_ICON[k];
            return (
              <TabsTrigger key={k} value={k}>
                <Icon className="size-4" />
                {TEMPLATE_KIND_LABELS[k]}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {TEMPLATE_KINDS.map((k) => {
          const list = byKind(k);
          const Icon = KIND_ICON[k];
          return (
            <TabsContent key={k} value={k} className="mt-4">
              {list.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((t) => (
                    <Card
                      key={t.id}
                      className="flex h-full flex-col transition-colors hover:border-primary"
                    >
                      <CardContent className="flex flex-1 flex-col gap-3 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5">
                            {t.source === "curated" ? (
                              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                            ) : (
                              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            )}
                            <p className="font-medium leading-tight">{t.name}</p>
                          </div>
                          <Badge
                            variant={t.source === "curated" ? "secondary" : "outline"}
                          >
                            {t.source === "curated" ? "Curated" : "Yours"}
                          </Badge>
                        </div>
                        <p className="flex-1 text-sm text-muted-foreground">
                          {t.description}
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <Button size="sm" onClick={() => use(t)}>
                            {isEmailTemplate(t) ? (
                              <>
                                <Eye className="size-4" /> Preview
                              </>
                            ) : (
                              <>
                                Use <ArrowRight className="size-4" />
                              </>
                            )}
                          </Button>
                          {!isEmailTemplate(t) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPreview(t)}
                            >
                              <Eye className="size-4" />
                            </Button>
                          )}
                          {t.source === "org" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="ml-auto text-muted-foreground hover:text-destructive"
                              disabled={deleting === t.id}
                              onClick={() => remove(t.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Icon}
                  title={`No ${TEMPLATE_KIND_LABELS[k].toLowerCase()} templates yet`}
                  description="Save one from an existing item, and it will show up here for the whole team to reuse."
                />
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      <TemplatePreview
        template={preview}
        onClose={() => setPreview(null)}
        onUse={(t) => {
          setPreview(null);
          use(t);
        }}
      />
    </>
  );
}

function TemplatePreview({
  template,
  onClose,
  onUse,
}: {
  template: Template | null;
  onClose: () => void;
  onUse: (t: Template) => void;
}) {
  const [copied, setCopied] = React.useState(false);
  // Reset the "Copied" state when the previewed template changes, without an
  // effect (see react-hooks/set-state-in-effect).
  const [lastId, setLastId] = React.useState(template?.id);
  if (template?.id !== lastId) {
    setLastId(template?.id);
    setCopied(false);
  }

  if (!template) return null;

  async function copyEmail() {
    if (!template || !isEmailTemplate(template)) return;
    const text = `Subject: ${template.content.subject}\n\n${template.content.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Dialog open={!!template} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template.name}</DialogTitle>
          <DialogDescription>{template.description}</DialogDescription>
        </DialogHeader>

        {isEmailTemplate(template) && (
          <div className="space-y-3">
            <div className="rounded-md border">
              <div className="border-b bg-muted/40 px-4 py-2 text-sm font-medium">
                {renderTemplate(template.content.subject, SAMPLE_MERGE)}
              </div>
              <div
                className="prose prose-sm max-w-none px-4 py-3"
                dangerouslySetInnerHTML={{
                  __html: renderTemplate(template.content.body, SAMPLE_MERGE),
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={copyEmail}>
                {copied ? (
                  <>
                    <Check className="size-4" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-4" /> Copy
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Insert this snippet directly while editing a campaign or workflow
              email — look for &ldquo;Insert template&rdquo; in the editor.
            </p>
          </div>
        )}

        {isCampaignTemplate(template) && (
          <div className="space-y-3">
            {template.content.steps.map((s, i) => (
              <div key={i} className="rounded-md border">
                <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
                  <span className="text-sm font-medium">Step {i + 1}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" /> {humanWait(s.wait_minutes)}
                  </span>
                </div>
                <div className="space-y-1 px-4 py-2">
                  <p className="text-sm font-medium">
                    {renderTemplate(s.subject, SAMPLE_MERGE)}
                  </p>
                  <div
                    className="prose prose-sm max-w-none text-muted-foreground"
                    dangerouslySetInnerHTML={{
                      __html: renderTemplate(s.body, SAMPLE_MERGE),
                    }}
                  />
                </div>
              </div>
            ))}
            <div className="flex justify-end">
              <Button onClick={() => onUse(template)}>
                Use this template <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {isWorkflowTemplate(template) && (
          <div className="space-y-2">
            {template.content.graph.nodes
              .filter((n) => (n.data as { kind?: string })?.kind === "action")
              .map((n, i) => {
                const act = (n.data as { action?: ActionType }).action;
                return (
                  <div
                    key={n.id}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground">{i + 1}.</span>
                    {act ? ACTION_LABELS[act] : "Step"}
                  </div>
                );
              })}
            <div className="flex justify-end pt-1">
              <Button onClick={() => onUse(template)}>
                Use this template <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
