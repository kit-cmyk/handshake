# Handshake — Implementation Status

## ✅ E1 — Foundation (complete, verified)
Scaffolded and building green (`npm run build` ✓, `tsc --noEmit` ✓, dev smoke-tested).

**Stack in place:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 ·
Supabase (SSR auth) · Inngest v4 · hand-rolled shadcn-style UI kit.

**What works:**
- Auth: email/password login + signup, session refresh middleware, `/auth/callback`
- Multi-tenant: `organizations` + `memberships` with RLS; onboarding creates an org
  (+ default pipeline/stages) via the `create_org_with_owner` RPC
- App shell: sidebar nav (Contacts, Companies, Import, Segments, Campaigns,
  Workflows, Reports, Settings), top bar with sign-out, dashboard with live counts
- Route protection: unauthed → `/login`; no-org → `/onboarding`
- Inngest: client + `/api/inngest` endpoint + `hello-world` durable fn (200 OK in dev)
- DB migration: `supabase/migrations/0001_init.sql` (tenancy, RLS, full CRM core +
  B2B firmographics on companies)

## ✅ E2 — Lead Management (complete, builds green)
Full CRM core over the schema, multi-tenant via RLS.

**What works:**
- **Contacts** — searchable/sortable table (TanStack Table), create/edit/delete via
  dialog, lifecycle stage + company assignment, row → detail page
- **Contact detail** — details card + **activity timeline** (note / call / task / email),
  task checkboxes (done toggle), add/delete activities
- **Companies** — table + create/edit/delete dialog with **both local (category) and
  B2B (industry, employees, revenue, domain, LinkedIn) fields**; detail page lists
  the company's contacts
- **Deals** — **kanban board** grouped by pipeline stage, create/edit deal dialog,
  move between stages (auto-sets won/lost from stage name), per-column totals, delete
- **UI kit** grew: dialog, select, dropdown-menu, table, badge, textarea (Radix-backed)

**New routes:** `/contacts`, `/contacts/[id]`, `/companies`, `/companies/[id]`, `/deals`

> Runtime CRUD needs a live Supabase (see below). Code is typecheck- and build-verified;
> without DB creds pages render but redirect to `/login`.

## ✅ E2b — Manual Contact Upload (complete, builds green)
CSV import wizard — the primary B2B lead source.

**What works:**
- **Upload** — pick target (Contacts or Companies), choose CSV; parsed client-side
  with papaparse (header row required)
- **Column mapping** — auto-guesses field↔column matches by name; manual override
  per field via dropdowns; required-field enforcement
- **Validate & preview** — live valid/error counts, first-5-rows preview, per-row
  validation (name-or-email for contacts, name for companies, email format)
- **Dedupe** — by **email** (contacts) / **domain** (companies) with skip / update /
  create-anyway modes; contact `Company (name)` column resolves to an existing
  company or creates one
- **Import batches** — every run recorded (`import_batches` table) with
  created/updated/skipped/errored counts + error list; recent-imports history on the page
- Imported contacts get `owner_id` = current user and a `source` label

**Migration:** `supabase/migrations/0002_import_batches.sql`
**Route:** `/import`

## ✅ Data Health — Contact Issue Resolution (complete, builds green)
Post-import data hygiene, layered on E2/E2b.

**Detection engine** (`src/lib/data-quality.ts`, pure/testable) flags:
- **Duplicate leads** — same email (case-insensitive)
- **Possible duplicates** — same name + company but no shared email
- **Invalid email** (bad format), **missing email**, **missing name**, **invalid phone** (<7 digits)

**Resolution:**
- **Merge duplicates** — choose which contact to keep, select which to merge; the
  action reassigns activities + deals to the kept contact, backfills its empty
  fields from the duplicates, then deletes them (`mergeContacts`)
- **Fix formatting/completeness** — inline edit via the contact dialog from a table
  of flagged contacts with issue badges
- **Surfaced proactively** — issues appear *where new data arrives*, not just on a
  page you must remember to visit:
  - After every **CSV import**, the result step runs a data-health check on the
    affected contacts and shows a `DataHealthCallout` ("N possible duplicates,
    M with formatting issues → Review & resolve")
  - A "Resolve issues (N)" button on the Contacts page when issues exist
  - `DataHealthCallout` + `summarize()` are **reusable** — the Google Places
    integration (E4) will drop the same post-ingest callout on scrape results
- **Route:** `/contacts/issues` (Data health); component: `src/components/data-health-callout.tsx`

> Complements E2b's import-time dedupe (skip/update by email/domain): the import
> stops most dupes at the door; Data Health cleans up what's already in the DB.

## ✅ E3 — Segments (complete, builds green)
Static + dynamic audiences over contacts.

**Filter engine** (`src/lib/segments.ts`, pure/testable):
- Fields: lifecycle stage, source, email, name, title + company name/city/industry
- Operators: is / is not / contains / does not contain / is empty / is not empty
- Match **all** (AND) or **any** (OR); empty filter = everyone
- `evaluateFilter()` used identically by builder preview, snapshot, and cron

**Builder** (`/segments/new`, `/segments/[id]`):
- Name + type (dynamic/static), match all/any, add/remove rule rows with
  field→operator→value (enum fields get a dropdown), **live "N of M match" preview**
  (debounced server call)

**Behavior:**
- **Static** — membership frozen as a snapshot in `segment_members`; "Refresh
  snapshot" re-applies the filter on demand
- **Dynamic** — membership computed **live** on every view; also cached in
  `segment_members` for downstream use
- **Scheduled re-evaluation** — hourly Inngest cron (`reevaluate-segments`)
  recomputes every dynamic segment, refreshes the cache, stamps
  `last_evaluated_at`, and emits **`segment/members.changed`** (added/removed
  contacts) — the auto-enroll hook campaigns/workflows will consume
- List page shows per-segment member counts (static cached, dynamic live)

**Migration:** `supabase/migrations/0003_segments.sql`
**New:** service-role admin client (`src/lib/supabase/admin.ts`) for the cross-org cron
**Routes:** `/segments`, `/segments/new`, `/segments/[id]`

## ✅ E5 — Campaigns (complete, builds green)
Multi-step outreach sequences on the durable Inngest engine.

**What works:**
- **Sequence builder** (`/campaigns/new`, `/campaigns/[id]`) — ordered steps with
  reorder/delete, per-step delay (minutes), subject + HTML body with merge tags
  (`{{first_name}}`, `{{company}}`, …); pick a segment (audience) + mailbox (sender)
- **Mailboxes** (Settings) — add sending identities with a daily limit (dev uses a
  mock sender; Resend used automatically if `EMAIL_PROVIDER_API_KEY` is set; OAuth
  Gmail/Outlook deferred)
- **Enrollment** — enroll a segment (static membership or live dynamic resolution),
  skipping contacts with no email / unsubscribed / suppressed / already enrolled;
  writes `enrolled` events
- **Durable send engine** (Inngest `campaign-enrollment`) — one run per enrollment:
  walks the sequence honoring delays (`step.sleep`), **re-checks enrollment +
  campaign status and suppressions before every send**, sends via the provider,
  writes a `sent` event, advances `current_step`; **pause stops in-flight runs,
  resume re-kicks them from where they left off**
- **Suppression & unsubscribe** — public `/api/unsubscribe?token=…` marks the
  contact unsubscribed, adds an org suppression, stops active enrollments, logs an
  `unsubscribed` event; every send appends an unsubscribe footer
- **Webhook ingest** — public `/api/webhooks/email` maps provider events
  (opened/clicked/replied/bounced) back via `message_id` → `events` + updates
  enrollment (replied/bounced) + suppresses on bounce
- **Events** — `enrolled`/`sent`/`completed` + webhook events populate the append-only
  `events` table, the data source for the E7 funnel report; campaign detail already
  shows per-step sent counts + enrollment-status breakdown

**Migration:** `supabase/migrations/0004_campaigns.sql`
**New libs:** `src/lib/email/{provider,template}.ts`, `src/lib/unsubscribe.ts`
**Routes:** `/campaigns`, `/campaigns/new`, `/campaigns/[id]`, `/api/unsubscribe`,
`/api/webhooks/email`; Inngest `campaign-enrollment` function

> To actually process sends in dev, run the Inngest dev server:
> `npx inngest-cli@latest dev` (with `INNGEST_DEV=1`). Mock provider logs sends.

## ✅ E7 — Campaign Funnel Reports (complete, builds green, tested)
Reads the `events` table E5 produces.

**Aggregation engine** (`src/lib/funnel.ts`, pure) — distinct-contact counts per
step and per stage (sent → opened → clicked → replied → booked), plus campaign-wide
totals and bounced/unsubscribed/failed side metrics. **Unit-tested with vitest**
(`src/lib/funnel.test.ts`, 7 tests: dedupe, ordering, side metrics, `pct`).

**UI:**
- **Reports index** (`/reports`) — per-campaign rollup: enrolled, sent, open rate,
  reply rate
- **Campaign funnel** (`/reports/[id]`) — stat tiles + per-step funnel bars with
  stage %s and step-over-step advance %; bounced/unsub/failed badges
- Linked from campaign detail ("View funnel report")

**Test runner added:** vitest (`npm test`) — reused by future epics.

## ✅ E6 — Automated Workflows (complete, builds green, tested)
Trigger-based automation on a visual node graph + durable engine.

**Graph engine** (`src/lib/workflows.ts`, pure) — trigger/action/node/edge model,
traversal (`nextNodeId`), and branch evaluation (reuses the segments rule
evaluator). **Unit-tested** (`workflows.test.ts`, 6 tests: traversal, branch
routing, condition eval, parse).

**Visual builder** (`/workflows/new`, `/workflows/[id]`) — react-flow canvas:
trigger + draggable action nodes (send email, wait, set lifecycle, add to segment),
connect edges, per-node config panel, remove step. Trigger config (type, target
segment, mailbox) above the canvas.

**Triggers:** Manual + Segment entry run **live**; reply / stage_change are
selectable and stored (auto-trigger wiring planned). Segment entry consumes the
E3 cron's `segment/members.changed` event.

**Durable engine** (Inngest `workflow-run`) — one run per contact: walks the graph
from the trigger, executes each action (`step.sleep` for waits), records
`workflow_run_steps` + events (with `workflow_id`/`workflow_node_id`), re-checks
run + workflow status before each node, persists `current_node`. `workflow-segment-entry`
auto-enrolls on segment entry. Unique active run per (workflow, contact) prevents
double-enrollment.

**Detail page** shows run-status breakdown; full per-node workflow report is E8.

**Migration:** `supabase/migrations/0005_workflows.sql`
**Routes:** `/workflows`, `/workflows/new`, `/workflows/[id]`
**Tests:** 13 total passing (funnel 7 + workflows 6)

## ✅ E8 — Workflow Reports (complete, builds green, tested)
Reads `workflow_runs` + `workflow_run_steps` produced by E6.

**Aggregation engine** (`src/lib/workflow-report.ts`, pure) — runs-by-status,
per-node entered/completed/failed, completion rate, and **average time-in-step**
(over completed steps only), ordered by graph traversal. **Unit-tested**
(`workflow-report.test.ts`, 5 tests — one caught a real avg-time bug: failed
steps were skewing the average).

**UI:**
- Reports index (`/reports`) now has **Campaigns + Workflows** sections
- Workflow report (`/reports/workflow/[id]`) — run-status stat tiles, **bottleneck
  callout** (lowest-completion step), per-step table with completion bars + avg
  time-in-step
- Linked from workflow detail ("View workflow report")

**Tests:** 18 total passing (funnel 7 + workflows 6 + workflow-report 5)

---

## 🎉 MVP roadmap COMPLETE
E1 Foundation · E2 Lead Management · E2b Import · Data Health · E3 Segments ·
E5 Campaigns · E7 Funnel Reports · E6 Workflows · E8 Workflow Reports — all
build-green and (where logic is pure) unit-tested.
Remaining from the plan: **E4 Google Places scraping** (top-of-funnel).

## ✅ E4 — Lead Scraping / Find Leads (complete, builds green, tested)
Top-of-funnel acquisition by industry + location.

- **Provider** (`src/lib/places/provider.ts`) — Google Places Text Search v1 when
  `GOOGLE_PLACES_API_KEY` is set, else a deterministic **mock** provider so dev works.
  Pure helpers `partitionResults` (dedupe by place_id) + `companyPayload`, **unit-tested**.
- **Enrichment** (`src/lib/places/enrich.ts`) — best-effort homepage email discovery
  (fast timeout, never throws); creates a contact when an email is found.
- **runScrape** action — bounded synchronous batch (no Inngest needed): search →
  dedupe vs existing `google_place_id` → insert companies (`source=google_places`) →
  optional enrichment → record `scrape_jobs` row with counts.
- **Find leads page** (`/prospect`) — search form (category, location, max, enrich
  toggle), results summary, recent-searches history, **and the reused
  DataHealthCallout** so issues on freshly acquired contacts surface immediately.
- **Migration:** `supabase/migrations/0006_scrape_jobs.sql`
- **Tests:** 22 total passing (funnel 7 + workflows 6 + workflow-report 5 + places 4)

## 🔧 To run locally (Supabase now wired)
`.env.local` points at the live project. To finish setup:
1. **Apply the schema** — paste `supabase/schema.sql` (all 6 migrations combined)
   into Supabase → SQL Editor → Run. *(MCP can't reach this project — different
   account — so run it manually.)*
2. **Service role key** — add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` (Supabase →
   Settings → API → service_role). Required only for background jobs (Inngest
   engines, webhooks, segment cron); the core app works without it.
3. (Optional) Supabase → Auth → disable "Confirm email" so signup logs in directly.
4. `npm run dev` → http://localhost:3000
5. (Optional, to process campaigns/workflows) `npx inngest-cli@latest dev`

## Notes
- `src/middleware.ts` uses the classic middleware convention. Next 16 prefers
  `proxy.ts`; current file still works (deprecation warning only). Rename later.
- UI kit is hand-rolled (Button/Input/Label/Card) — no Radix dependency yet.
  Add `@radix-ui/*` primitives when we need dialogs/dropdowns/selects (E2+).

## Next up — E2b Manual Contact Upload
CSV/spreadsheet upload with column mapping, validation/preview, dedupe
(email/domain), import batches. Reuses the contacts/companies write layer.
Then E3 (Segments).
