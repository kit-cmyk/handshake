// Template library — shared types.
//
// A template is a reusable starting point of one of three kinds. Its `content`
// shape is discriminated by `kind`. Curated templates ship in code with a
// `source: "curated"`; user-saved ones come from the `templates` table with a
// `source: "org"` and a real database id.

import type { TriggerType, WorkflowGraph } from "@/lib/workflows";

export type TemplateKind = "email" | "campaign" | "workflow";

export const TEMPLATE_KINDS: TemplateKind[] = ["email", "campaign", "workflow"];

export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  email: "Emails",
  campaign: "Campaigns",
  workflow: "Workflows",
};

/** A reusable subject + body snippet. */
export type EmailTemplateContent = {
  subject: string;
  body: string;
};

/** A single step within a campaign-template sequence. */
export type CampaignTemplateStep = {
  subject: string;
  body: string;
  wait_minutes: number;
  /** null = inherit campaign default; true/false = per-step override. */
  stop_on_reply: boolean | null;
};

/** A full multi-step email sequence. */
export type CampaignTemplateContent = {
  stop_on_reply: boolean;
  steps: CampaignTemplateStep[];
};

/** A trigger + node graph. */
export type WorkflowTemplateContent = {
  trigger_type: TriggerType;
  graph: WorkflowGraph;
};

export type TemplateContent =
  | EmailTemplateContent
  | CampaignTemplateContent
  | WorkflowTemplateContent;

/** Where a template came from — affects whether it can be edited/deleted. */
export type TemplateSource = "curated" | "org";

type TemplateBase = {
  id: string;
  name: string;
  description: string;
  source: TemplateSource;
  /** Present only for org templates. */
  createdAt?: string;
};

export type EmailTemplate = TemplateBase & {
  kind: "email";
  content: EmailTemplateContent;
};
export type CampaignTemplate = TemplateBase & {
  kind: "campaign";
  content: CampaignTemplateContent;
};
export type WorkflowTemplateItem = TemplateBase & {
  kind: "workflow";
  content: WorkflowTemplateContent;
};

export type Template = EmailTemplate | CampaignTemplate | WorkflowTemplateItem;

/** Narrowing helpers used by the UI + query layer. */
export function isEmailTemplate(t: Template): t is EmailTemplate {
  return t.kind === "email";
}
export function isCampaignTemplate(t: Template): t is CampaignTemplate {
  return t.kind === "campaign";
}
export function isWorkflowTemplate(t: Template): t is WorkflowTemplateItem {
  return t.kind === "workflow";
}
