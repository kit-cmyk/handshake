# Handshake — TODO

Running log of deferred work and future features for this project. Add new items
here rather than leaving "Coming soon"/placeholder UI in the app.

## Database

- [x] **Apply migration `0016_contact_fields.sql`** — `lead_source`, `address`,
  `appointment_date` on `contacts`. Applied.
- [ ] **Apply migration `0017_contact_address.sql`** — adds structured,
  international address columns (`address_line2`, `city`, `region`,
  `postal_code`, `country`) to `contacts`. Run it against the Supabase project
  so the structured address inputs, CSV import mapping, and displays have
  backing columns. Until applied, saving these fields will error.
- [ ] **Apply migration `0018_company_geo.sql`** — adds `latitude`/`longitude`
  to `companies` for map plotting and radius search on the Find leads page.
  Until applied, prospected businesses won't persist coordinates (the results
  map still works from the live search response).
- [x] **Apply migration `0019_deal_detail.sql`** — `service`, `description`,
  `priority` on `deals` + the `appointment` activity type. Applied.
- [x] **Apply migration `0020_inbox.sql`** — `conversations`, `messages`,
  `conversation_reads` (with an updated-conversation trigger and org-scoped RLS)
  that back the new Inbox. Applied.
- [x] **Apply migration `0021_stage_lifecycle.sql`** — adds the `lifecycle_stage`
  column on `stages` (the configurable stage→lifecycle mapping), backfills
  existing stages by name, and updates `create_org_with_owner` to seed it.
  Applied.
- [ ] **Apply migration `0023_campaign_audience.sql`** — adds `audience_mode`
  (`segment` | `contacts` | `import`) and `send_delay_minutes` to `campaigns`,
  backing the 5-step campaign wizard's audience choice and the "At delay" send
  time. Until applied, saving a campaign from the wizard will error (the columns
  don't exist yet).

## Inbox

- [ ] **Campaign/workflow sends as message bubbles** — one-off emails sent from
  the Inbox and inbound replies render as chat bubbles, but automated campaign
  and workflow sends appear only as "Email sent" system lines (derived from
  `events`), not bubbles. To unify the thread, have the Inngest send path
  (`src/lib/inngest/functions.ts`) also upsert a conversation + insert an
  outbound `messages` row on each send. Deferred to keep the sending engine
  untouched in the first cut.
- [ ] **Surface inbox messages on the contact/deal detail timelines** — the
  contact detail page (`src/app/(app)/contacts/[id]/page.tsx`) and deal side
  sheet read `activities` only, so emails sent/received via the Inbox (stored in
  `messages`) don't appear there yet. Merge `messages` into those timelines the
  same way the Inbox does (`src/lib/inbox/timeline.ts`).
- [ ] **Real inbound-parse wiring** — the inbound webhook now captures message
  bodies when a provider forwards the parsed email (`from`/`subject`/`text`/
  `html`), including a cold-inbound match by sender email. Configure the mail
  provider's inbound-parse (or an IMAP poller) to POST that payload to
  `/api/webhooks/inbound`. Cold matches are by first contact with that email;
  revisit if the same address exists across multiple orgs.

## Find leads / prospecting

- [ ] **People / demographic lead search** — the Find leads page currently
  searches *businesses* only (Google Places: category, location, radius,
  rating, has-website/phone, open-now). Person-level conditions (age, gender,
  and other consumer demographics) were requested but have no connected data
  source — Google Places and B2B tools don't provide them, and they're
  regulated consumer PII. To add: wire a people-data provider (e.g. Apollo,
  People Data Labs, Clearbit, ZoomInfo) behind a provider interface like
  `src/lib/places/provider.ts`, plus a compliance review. Only surface the
  demographic filter controls once a real source backs them.
- [ ] **Persisted map view of companies** — `companies.latitude/longitude` are
  now captured on prospect import; a saved-companies map (filter by radius over
  existing CRM data, not just the last search) could reuse `ProspectMap`.

## Deals / Calendar

- [ ] **Google Calendar OAuth for appointment booking** — the deal detail view
  books appointments and records them in-app (as `appointment` activities that
  also set the contact's appointment date). Real Google Calendar event creation
  is scaffolded in `src/lib/calendar/provider.ts`: it activates when a
  `GOOGLE_CALENDAR_ACCESS_TOKEN` is present, but proper per-user OAuth (consent
  screen, token storage + refresh, likely reusing the Google auth already used
  elsewhere) still needs wiring. Until then, booking works in-app and the UI
  says "Connect Google Calendar to sync it."

## Pipeline ⇄ Lifecycle

- [x] **Configurable stage → lifecycle mapping** — moving a deal on the pipeline
  syncs its linked contact's lifecycle stage (`src/lib/lifecycle.ts`, wired into
  `moveDeal`/`saveDeal`). Each stage carries a `lifecycle_stage` column
  (migration `0021_stage_lifecycle.sql`) that is the source of truth; it's edited
  per stage in **Settings → Pipeline**. Unmapped stages fall back to name
  matching, and if still no match the contact is left untouched. Requires
  applying `0021_stage_lifecycle.sql` (see Database).
- [ ] **Full pipeline/stage editing** — stages can be *mapped* to a lifecycle in
  Settings → Pipeline, but not yet renamed/added/removed/reordered, and there's
  still only one pipeline per org (seeded by `create_org_with_owner`). Add stage
  CRUD + multiple pipelines when needed; the lifecycle mapping UI already lives
  in the right place to grow into it.
- [ ] **Multi-deal lifecycle contention** — a contact with several deals takes
  the lifecycle of whichever deal moved last. Fine for the common one-deal case;
  revisit with a "highest/most-recent stage wins" rule if multi-deal contacts
  become common.

## Campaigns

- [ ] **Re-enroll completed/stopped contacts** — enrollment eligibility skips any
  contact that already has an enrollment row of *any* status, so someone who
  completed or stopped a sequence can never be re-run through it. The enroll
  confirmation now reports how many were skipped and why (e.g. "12 already
  enrolled"), but there's no way to intentionally re-enroll them. Add an opt-in
  "re-enroll finished contacts" path (clear terminal enrollments for the chosen
  contacts, or allow a fresh row) guarded by explicit confirmation so it can't
  double-send by accident. See `enrollCampaign` in
  `src/app/(app)/campaigns/actions.ts`.
- [ ] **Enforce a send cap for the default sender** — the per-mailbox daily cap
  in the Inngest engine (`campaignEngine`, `src/lib/inngest/functions.ts`) only
  runs when a mailbox with `daily_limit > 0` is selected. The "Default sender"
  path is uncapped. The builder now warns about this, but a real fix is an
  org-level default daily cap (config + the same defer-to-next-UTC-day logic
  applied when no mailbox is set).
- [ ] **Reordering steps on a live campaign vs. `current_step`** — step rows now
  keep their ids across edits (so funnel/`sent` analytics stay linked), but
  `campaign_enrollments.current_step` is a positional index. If you reorder or
  delete steps while contacts are mid-sequence, an in-flight contact resumes at
  whatever now sits at that position. Consider migrating `current_step` to track
  the step id (or a stable step key) so resume survives reordering. Low priority
  until reordering live campaigns is common.

## Workflows / automation

- [ ] **Throttle `email_opened` / `email_clicked` workflow triggers** — enrollment
  triggering now lives entirely in workflows (campaigns are manual- or
  workflow-enrolled only, via the new "Enroll in campaign" action; migration
  `0024_workflow_triggers.sql`). The open/click triggers fire off the
  tracking-pixel (`/api/track/open`) and click-redirect (`/api/track/click`)
  routes, which emit `contact/email.opened` / `contact/email.clicked`. Opens in
  particular are noisy — mail clients prefetch/reload pixels — so a contact can
  emit many open events. Duplicate *runs* are already prevented by the
  active-run guard in `enrollContactsInWorkflow`, but consider a short dedupe
  window (or first-open-only) if these triggers cause churn once in real use.
- [ ] **Seed a GHL-style template using "Enroll in campaign"** — the workflow
  templates (`src/app/(app)/workflows/templates.ts`) don't yet showcase the new
  `enroll_campaign` action or the activity/open/click triggers. A template can't
  hard-code a `campaignId` (org-specific), so any such template ships an
  intentionally-incomplete step the user must configure before saving.

## Integrations / Email

- [ ] **Gmail & Outlook OAuth mailboxes** — connect a mailbox via OAuth for
  authenticated send-as delivery, instead of only provider-API sending.
  (Removed the "Coming soon" placeholder card from the integrations page.)
- [ ] **Public API & Zapier** — push/pull records from external tools via a
  public API. (Removed the "Coming soon" placeholder card.)
- [x] **Configurable default sender** — done. The fallback `from` is now
  `defaultFrom()` (reads `EMAIL_FROM`, defaults to `Handshake <onboarding@resend.dev>`),
  centralized in `src/lib/email/provider.ts` and used by the inngest engine,
  campaign/workflow/inbox actions, and team invites. All outbound HTML is wrapped
  in the shared shell (`src/lib/email/layout.ts`).
  - [ ] **Follow-up: verify a real domain in Resend** and set `EMAIL_FROM` to an
    address on it. Until then Resend only *delivers* mail sent from
    `onboarding@resend.dev` to your own Resend account email; sends to anyone
    else are accepted by the API but dropped.
- [ ] **Apply branded Supabase auth email templates** — HTML templates are built
  and version-controlled in `supabase/templates/` (see the README there). They
  can't be set from code (hosted, dashboard-managed project), so:
  - [ ] Paste **confirmation.html** ("Confirm signup") and **recovery.html**
    ("Reset password") — the only two that fire today — into Supabase → Auth →
    Emails → Templates, with the subject lines from the README. Do these first.
  - [ ] Paste the remaining four (magic_link, invite, email_change,
    reauthentication) when those flows get turned on.
  - [ ] Keep the `{{ .ConfirmationURL }}` / `{{ .Token }}` variables intact.
  - [ ] Optional: host an 88×88 PNG of the logo mark and swap the inline `<svg>`
    for an `<img>` so it renders in Gmail/Outlook (which strip SVG).
  - [ ] Optional: route auth emails through Resend via Supabase custom SMTP
    (Auth → Emails → SMTP Settings) — needs a verified domain first.
