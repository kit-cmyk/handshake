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
//
// These ship as complete, ready-to-send emails — greeting, body, a clear call
// to action, and a signature — not one-line stubs. The signature and the "book
// a time" links fill themselves from merge tokens resolved at send time:
//   {{sender_name}} / {{sender_email}} — the sending mailbox's identity
//   {{booking_link}}                   — the workspace booking URL (Settings ▸ Workspace)
// Recipient tokens ({{first_name}}, {{company}}, {{title}}) come from the contact.

/** Consistent sign-off used across the curated emails. */
const SIGNATURE =
  "<p>Best,<br />{{sender_name}}<br />" +
  '<a href="mailto:{{sender_email}}">{{sender_email}}</a></p>';

/** A low-friction "book a time" line pointing at the workspace booking link. */
const BOOKING_LINE =
  "<p>Prefer to skip the back-and-forth? " +
  '<a href="{{booking_link}}">Grab a time on my calendar</a>.</p>';

export const CURATED_EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "email-cold-intro",
    kind: "email",
    source: "curated",
    name: "Cold intro",
    description:
      "A personable first-touch email — context, a concrete idea, and an easy next step.",
    content: {
      subject: "A quick idea for {{company}}",
      body:
        "<p>Hi {{first_name}},</p>" +
        "<p>I'll keep this short. I work with teams like {{company}}, and the challenges that land on the desk of someone in a {{title}} role are exactly the ones we help with — usually the messy, manual work that quietly eats the week.</p>" +
        "<p>The reason I'm reaching out: I had a specific idea for how {{company}} could tackle that, and I'd rather show you than pitch you. It takes about ten minutes.</p>" +
        "<p>Would you be open to a quick call this week? If a time works better than a reply, my calendar is below.</p>" +
        BOOKING_LINE +
        SIGNATURE,
    },
  },
  {
    id: "email-follow-up",
    kind: "email",
    source: "curated",
    name: "Follow-up nudge",
    description: "A warm, no-pressure bump when your first email went unanswered.",
    content: {
      subject: "Following up, {{first_name}}",
      body:
        "<p>Hi {{first_name}},</p>" +
        "<p>Floating my last note back to the top of your inbox in case it slipped by — no worries at all if the timing has been busy.</p>" +
        "<p>The short version: I think there's a genuinely useful idea here for {{company}}, and I'd love five minutes to walk you through it. If it's not a fit, just say the word and I'll leave you be.</p>" +
        "<p>Happy to work around your schedule — grab whatever time suits you:</p>" +
        BOOKING_LINE +
        SIGNATURE,
    },
  },
  {
    id: "email-reengage",
    kind: "email",
    source: "curated",
    name: "Re-engagement",
    description: "Win back a contact who has gone quiet, gracefully.",
    content: {
      subject: "Still the right time, {{first_name}}?",
      body:
        "<p>Hi {{first_name}},</p>" +
        "<p>It's been a little while, so I wanted to check back in. A lot can change in a few months — priorities shift, teams grow — so I didn't want to assume the door was closed.</p>" +
        "<p>If now is a better moment to revisit this for {{company}}, I'd be glad to pick things up where we left off. And if it isn't, no hard feelings — just let me know and I'll follow up further down the road.</p>" +
        "<p>If it's easier to just talk it through, here's my calendar:</p>" +
        BOOKING_LINE +
        SIGNATURE,
    },
  },
  {
    id: "email-meeting-request",
    kind: "email",
    source: "curated",
    name: "Meeting request",
    description: "Ask for a specific, low-friction time to talk — with a one-click booking link.",
    content: {
      subject: "15 minutes this week, {{first_name}}?",
      body:
        "<p>Hi {{first_name}},</p>" +
        "<p>Would you be open to a quick 15-minute call this week? I'd love to understand how {{company}} is approaching this right now, and share a couple of things that have worked well for similar teams.</p>" +
        "<p>No slides, no hard sell — just a focused conversation to see whether it's worth going further.</p>" +
        "<p>The easiest way is to pick a slot that suits you:</p>" +
        BOOKING_LINE +
        "<p>Or just reply with a couple of times and I'll send an invite.</p>" +
        SIGNATURE,
    },
  },
  {
    id: "email-thank-you",
    kind: "email",
    source: "curated",
    name: "Thank you",
    description: "A warm note after a call or meeting, with clear next steps.",
    content: {
      subject: "Great talking, {{first_name}}",
      body:
        "<p>Hi {{first_name}},</p>" +
        "<p>Thanks for the time today — I really enjoyed learning more about {{company}} and where you're headed. It was helpful to hear how you're thinking about this.</p>" +
        "<p>As promised, I'll pull together a short summary of what we discussed, along with the next steps, and send it over shortly. If anything comes to mind in the meantime, just reply here.</p>" +
        "<p>If it's useful to grab another time to go deeper, my calendar is always open:</p>" +
        BOOKING_LINE +
        SIGNATURE,
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
      "Introduce yourself, add value, then ask for time — full emails spaced over a week.",
    content: {
      stop_on_reply: true,
      steps: [
        {
          subject: "A quick idea for {{company}}",
          body:
            "<p>Hi {{first_name}},</p>" +
            "<p>I'll keep this brief. I work with teams like {{company}}, and I had a specific idea for how you might tackle the manual work that tends to pile up around a {{title}} role.</p>" +
            "<p>I'd rather show you than pitch you — it takes about ten minutes. Would you be open to it?</p>" +
            SIGNATURE,
          wait_minutes: 0,
          stop_on_reply: null,
        },
        {
          subject: "One thing that might help, {{first_name}}",
          body:
            "<p>Hi {{first_name}},</p>" +
            "<p>Following up with something concrete. The teams we work with usually see the biggest lift from tightening one specific workflow — the handoffs that quietly cost hours every week.</p>" +
            "<p>I put together a short walkthrough of how that could look for {{company}}. Happy to send it over, or talk it through live — whichever is easier for you.</p>" +
            SIGNATURE,
          wait_minutes: 3 * DAY,
          stop_on_reply: null,
        },
        {
          subject: "Worth a quick call, {{first_name}}?",
          body:
            "<p>Hi {{first_name}},</p>" +
            "<p>Last one from me for now. If any of this landed, I'd love 15 minutes to understand how {{company}} is approaching it today and share what's worked for similar teams.</p>" +
            "<p>The easiest way is to grab a slot that suits you:</p>" +
            BOOKING_LINE +
            "<p>Or just reply with a couple of times and I'll send an invite.</p>" +
            SIGNATURE,
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
    description: "Two-step sequence to revive contacts who went cold — gracefully.",
    content: {
      stop_on_reply: true,
      steps: [
        {
          subject: "Still the right time, {{first_name}}?",
          body:
            "<p>Hi {{first_name}},</p>" +
            "<p>It's been a while, so I wanted to check back in. Priorities shift and teams change, so I didn't want to assume the door was closed on this for {{company}}.</p>" +
            "<p>If now is a better moment to revisit it, I'd be glad to pick up where we left off. If it's easier to just talk, here's my calendar:</p>" +
            BOOKING_LINE +
            SIGNATURE,
          wait_minutes: 0,
          stop_on_reply: null,
        },
        {
          subject: "Closing the loop, {{first_name}}",
          body:
            "<p>Hi {{first_name}},</p>" +
            "<p>I don't want to crowd your inbox, so I'll stop reaching out for now. The door's always open, though — whenever the timing is right for {{company}}, just reply to this note and we'll take it from there.</p>" +
            "<p>Wishing you and the team well in the meantime.</p>" +
            SIGNATURE,
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
          body:
            "<p>Hi {{first_name}},</p>" +
            "<p>We've been quietly building something we think teams like {{company}} are going to love, and I wanted you to be among the first to know.</p>" +
            "<p>The full reveal lands in a few days. No action needed yet — just keep an eye on your inbox.</p>" +
            SIGNATURE,
          wait_minutes: 0,
          stop_on_reply: null,
        },
        {
          subject: "It's here, {{first_name}}",
          body:
            "<p>Hi {{first_name}},</p>" +
            "<p>It's live. Here's the short version of what's new and why it matters for teams like {{company}} — I've tried to cut straight to the parts that'll actually save you time.</p>" +
            "<p>Want a proper look? I'm happy to give you a quick, tailored tour:</p>" +
            BOOKING_LINE +
            SIGNATURE,
          wait_minutes: 3 * DAY,
          stop_on_reply: null,
        },
        {
          subject: "Have you had a chance to try it, {{first_name}}?",
          body:
            "<p>Hi {{first_name}},</p>" +
            "<p>Just checking in to see whether you've had a chance to explore it. If anything's unclear or you'd like a hand getting set up, I'm glad to help.</p>" +
            "<p>A quick walkthrough is often the fastest way in — grab a time whenever suits:</p>" +
            BOOKING_LINE +
            SIGNATURE,
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
