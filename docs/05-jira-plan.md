# Handshake — Jira Plan (PROPOSAL — nothing created yet)
Status: AWAITING APPROVAL before any Jira project/tasks are created | Date: 2026-07-08

> Per your instruction, no Jira project or GitHub repo has been created. This is the
> proposed epic + task breakdown for review. Tasks are sized to ≤1 day. On approval,
> each task will be expanded into the full Jira template (user story, requirements,
> acceptance criteria, DoD) at creation time.

Suggested Jira project key: **HAND**
Build order: E1 → E2 → E2b → E3 → (E4 ∥ E5) → E6 → E7 → E8

Persona note: E2b (manual upload) is the **primary lead source for the B2B persona**
and lands right after core Lead Management, so B2B users are productive before the
Places scraper (E4, local-services) is built.

---

## E1 — Foundation
- HAND: Supabase project + schema migration (tenancy, RLS policies)
- HAND: Supabase Auth + login/signup + session handling
- HAND: Org + membership model, org-switch, invite flow (basic)
- HAND: Next.js app shell (nav, layout, shadcn/ui setup)
- HAND: Inngest wiring (client, dev server, one hello-world durable fn)
- HAND: CI (GitHub Actions: lint + test + build)  ← repo created later, on your go
- HAND: [Testing] Auth + RLS isolation tests

## E2 — Lead Management
- HAND: companies table UI — list (react-table), filters (local + B2B firmographics), detail page
- HAND: contacts table UI — list, detail, lifecycle + owner assignment
- HAND: manual create/edit/delete for companies + contacts
- HAND: activities (notes/calls/tasks) on contact/company detail
- HAND: pipelines + stages config
- HAND: deals — create, move across stages (board view), value + close date
- HAND: [Testing] CRUD + pipeline movement integration tests

## E2b — Manual Contact Upload (first-class, primary B2B lead source)
- HAND: single manual contact/company add form (quick-add)
- HAND: CSV/spreadsheet upload — file parse + column-mapping UI (map to contact/company fields)
- HAND: import validation + preview (row errors, required fields, email format)
- HAND: dedupe on import — match by email (contact) / domain (company), choose skip/merge/update
- HAND: import batches — status, counts (created/updated/skipped/errored), downloadable error report
- HAND: assign owner + tag/segment + source on import
- HAND: [Testing] parse + column-map + dedupe/merge import tests

## E3 — Segments
- HAND: segment data model + list UI
- HAND: filter builder UI (field/operator/value groups)
- HAND: static segment — snapshot membership from current filter
- HAND: dynamic segment — save definition, live count + live member resolution
- HAND: scheduled dynamic re-evaluation (Inngest cron) + auto-enroll hook
- HAND: [Testing] static vs dynamic resolution correctness tests

## E4 — Lead Scraping (Google Places)
- HAND: Google Places integration (server) — text/nearby search by category+location
- HAND: scrape_jobs model + "new search" UI (category, location, radius) + preview
- HAND: Inngest scrape job — paged fetch, dedupe by google_place_id, rate limiting
- HAND: enrichment step — website email discovery (best-effort) [+ provider hook]
- HAND: import results → upsert companies (+ contacts) with source tagging
- HAND: scrape job status/history UI (requested/imported/deduped counts)
- HAND: [optional/fast-follow] B2B data provider integration (Apollo/PDL) — firmographic search + import (reuses E2b import pipeline)
- HAND: [Testing] dedupe + import mapping tests (mocked Places responses)

## E5 — Campaigns
- HAND: campaign + campaign_steps model + list UI
- HAND: sequence builder UI (ordered steps, delays, email subject/body templates)
- HAND: mailbox connect (OAuth) + send config (daily limits, throttling)
- HAND: email provider integration + send + webhook ingest → events
- HAND: enroll segment into campaign → campaign_enrollments
- HAND: Inngest send engine — step-through with delays, stop-on-reply/unsubscribe
- HAND: unsubscribe handling + suppression
- HAND: [Testing] enrollment + step progression + suppression tests

## E6 — Automated Workflows
- HAND: workflow model (trigger + graph_jsonb) + list UI
- HAND: trigger config (segment_entry / reply / stage_change / manual)
- HAND: visual node/edge builder (react-flow) with action library (send email, wait, tag, move stage, add to segment)
- HAND: Inngest workflow execution engine — run graph, write run + run_steps + events
- HAND: enrollment + de-dup (don't re-enter active run)
- HAND: [Testing] graph execution + branch/wait node tests

## E7 — Campaign Funnel Reports
- HAND: funnel aggregation query/service over events (per step)
- HAND: campaign report UI — per-step sent→opened→clicked→replied→booked + drop-off %
- HAND: campaign list dashboard (rollup metrics)
- HAND: [Testing] funnel aggregation correctness tests

## E8 — Workflow Reports
- HAND: workflow aggregation query/service (runs by status, per-node completion, time-in-step)
- HAND: workflow report UI — enrollment funnel across nodes + bottleneck view
- HAND: [Testing] workflow aggregation correctness tests

---

## MVP cut (if you want to ship the core loop first)
E1 → E2 → E3 → E5 (email only) → E7. Delivers target → reach → measure.
Then E4 (scraping) + E6 (workflows) + E8 in V1.
