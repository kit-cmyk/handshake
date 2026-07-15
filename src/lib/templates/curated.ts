// Built-in template library. These ship in code and are available to every org
// alongside the templates users save themselves. Workflow entries reuse the
// existing WORKFLOW_TEMPLATES so the "New workflow" screen and the library stay
// in sync from a single source of truth.

import { WORKFLOW_TEMPLATES } from "@/app/(app)/workflows/templates";
import type {
  CampaignTemplate,
  EmailTemplate,
  Template,
  TemplateKind,
  WorkflowTemplateItem,
} from "./types";

// ---- Emails ---------------------------------------------------------------

export const CURATED_EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "email-cold-intro",
    kind: "email",
    source: "curated",
    name: "Cold intro",
    description: "A short, personable first-touch email to a new prospect.",
    content: {
      subject: "Quick idea for {{company}}",
      body: "<p>Hi {{first_name}},</p><p>I work with teams like {{company}} on the kind of thing your role at {{title}} touches every day. I had a specific idea I think could help — mind if I share it?</p><p>Worth a quick chat this week?</p>",
    },
  },
  {
    id: "email-follow-up",
    kind: "email",
    source: "curated",
    name: "Follow-up nudge",
    description: "A gentle bump when your first email went unanswered.",
    content: {
      subject: "Following up, {{first_name}}",
      body: "<p>Hi {{first_name}},</p><p>Floating this back to the top of your inbox in case it slipped by. Happy to keep it to five minutes — just point me at a time that works.</p>",
    },
  },
  {
    id: "email-reengage",
    kind: "email",
    source: "curated",
    name: "Re-engagement",
    description: "Win back a contact who has gone quiet.",
    content: {
      subject: "Still the right time, {{first_name}}?",
      body: "<p>Hi {{first_name}},</p><p>It's been a little while, so I wanted to check in. If now isn't the right moment for {{company}}, no worries at all — just let me know and I'll follow up down the road.</p>",
    },
  },
  {
    id: "email-meeting-request",
    kind: "email",
    source: "curated",
    name: "Meeting request",
    description: "Ask for a specific, low-friction time to talk.",
    content: {
      subject: "15 minutes this week, {{first_name}}?",
      body: "<p>Hi {{first_name}},</p><p>Would you be open to a quick 15-minute call this week? I'd love to understand how {{company}} is approaching this and see whether we can help.</p><p>If it's easier, just reply with a couple of times and I'll send an invite.</p>",
    },
  },
  {
    id: "email-thank-you",
    kind: "email",
    source: "curated",
    name: "Thank you",
    description: "A warm note after a call or meeting.",
    content: {
      subject: "Great talking, {{first_name}}",
      body: "<p>Hi {{first_name}},</p><p>Thanks for the time today — really enjoyed learning more about {{company}}. I'll pull together what we discussed and send it over shortly.</p><p>Talk soon!</p>",
    },
  },
];

// ---- Campaigns ------------------------------------------------------------

const DAY = 1440;

export const CURATED_CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: "campaign-3-touch-nurture",
    kind: "campaign",
    source: "curated",
    name: "3-touch nurture",
    description:
      "Introduce yourself, add value, then ask for time — spaced over a week.",
    content: {
      stop_on_reply: true,
      steps: [
        {
          subject: "Quick idea for {{company}}",
          body: "<p>Hi {{first_name}},</p><p>I had a specific idea for {{company}} I think is worth 30 seconds of your time. Mind if I share it?</p>",
          wait_minutes: 0,
          stop_on_reply: null,
        },
        {
          subject: "One thing that might help, {{first_name}}",
          body: "<p>Hi {{first_name}},</p><p>Following up with something concrete: teams in your spot usually see the biggest lift from tightening this one workflow. Happy to walk you through it.</p>",
          wait_minutes: 3 * DAY,
          stop_on_reply: null,
        },
        {
          subject: "Worth a quick call?",
          body: "<p>Hi {{first_name}},</p><p>Would a short call make sense? Reply with a couple of times and I'll send an invite.</p>",
          wait_minutes: 4 * DAY,
          stop_on_reply: null,
        },
      ],
    },
  },
  {
    id: "campaign-reengage-winback",
    kind: "campaign",
    source: "curated",
    name: "Re-engagement win-back",
    description: "Two-step sequence to revive contacts who went cold.",
    content: {
      stop_on_reply: true,
      steps: [
        {
          subject: "Still the right time, {{first_name}}?",
          body: "<p>Hi {{first_name}},</p><p>It's been a while — I wanted to check whether now is a better moment for {{company}}.</p>",
          wait_minutes: 0,
          stop_on_reply: null,
        },
        {
          subject: "Closing the loop",
          body: "<p>Hi {{first_name}},</p><p>I'll stop reaching out for now, but the door's always open. Just reply whenever the timing's right.</p>",
          wait_minutes: 5 * DAY,
          stop_on_reply: null,
        },
      ],
    },
  },
  {
    id: "campaign-product-launch",
    kind: "campaign",
    source: "curated",
    name: "Product launch",
    description: "Tease, announce, and follow up on a new release.",
    content: {
      stop_on_reply: false,
      steps: [
        {
          subject: "Something new is coming, {{first_name}}",
          body: "<p>Hi {{first_name}},</p><p>We've been building something we think {{company}} will love. Sneak peek dropping in a few days — keep an eye out.</p>",
          wait_minutes: 0,
          stop_on_reply: null,
        },
        {
          subject: "It's here",
          body: "<p>Hi {{first_name}},</p><p>It's live! Here's what's new and why it matters for teams like {{company}}.</p>",
          wait_minutes: 3 * DAY,
          stop_on_reply: null,
        },
        {
          subject: "Have you tried it yet?",
          body: "<p>Hi {{first_name}},</p><p>Just checking in — happy to give you a quick tour if that's helpful.</p>",
          wait_minutes: 4 * DAY,
          stop_on_reply: null,
        },
      ],
    },
  },
];

// ---- Workflows (adapted from the builder's starter templates) --------------

export const CURATED_WORKFLOW_TEMPLATES: WorkflowTemplateItem[] =
  WORKFLOW_TEMPLATES.map((t) => ({
    id: `workflow-${t.id}`,
    kind: "workflow" as const,
    source: "curated" as const,
    name: t.name,
    description: t.description,
    content: { trigger_type: t.trigger_type, graph: t.graph },
  }));

// ---- Aggregate ------------------------------------------------------------

export const CURATED_TEMPLATES: Template[] = [
  ...CURATED_EMAIL_TEMPLATES,
  ...CURATED_CAMPAIGN_TEMPLATES,
  ...CURATED_WORKFLOW_TEMPLATES,
];

export function curatedByKind(kind: TemplateKind): Template[] {
  return CURATED_TEMPLATES.filter((t) => t.kind === kind);
}

/** Look up a single curated template by its stable string id. */
export function findCuratedTemplate(id: string): Template | undefined {
  return CURATED_TEMPLATES.find((t) => t.id === id);
}
