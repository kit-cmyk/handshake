# Handshake — System Architecture
Status: DRAFT for review | Date: 2026-07-08

## Components
| Component | Technology | Responsibility |
|-----------|-----------|----------------|
| Web app | Next.js (App Router) on Vercel | UI + API route handlers |
| Database | Supabase Postgres + RLS | All persistent state, tenant isolation |
| Auth | Supabase Auth | Login, sessions, org membership |
| Job engine | Inngest Cloud | Durable campaign sends, delays, workflow runs, segment re-eval |
| Lead sourcing | Google Places API + enrichment | Acquire local businesses by industry/location |
| Email | Resend/Postmark + per-user OAuth mailboxes | Transactional + cold outreach sends |
| Events store | Postgres `events` table (append-only) | Backbone of all reporting |

## Data Flow — primary loops

### A. Acquire (Lead Scraping)
User picks industry/category + location → `scrape_jobs` row created → Inngest job
calls Google Places (paged) → dedupe by `google_place_id` → optional enrichment
(website email) → upsert `companies` (+ `contacts` where a person/email is found)
→ job status + counts surfaced in UI.

### B. Target (Segments)
User builds a filter → static: snapshot rows into `segment_members`; dynamic: save
`definition_jsonb`, resolve live for display, and re-evaluate on a schedule so
campaigns/workflows can auto-enroll newly matching contacts.

### C. Reach (Campaigns)
Enroll a segment into a campaign → `campaign_enrollments` created → Inngest steps
through `campaign_steps` honoring delays → send via the rep's mailbox → provider
webhooks (open/click/reply/bounce) write to `events` → funnel report aggregates.

### D. Automate (Workflows)
Trigger fires (e.g., contact enters segment, replies, stage change) → `workflow_runs`
created → Inngest executes the `graph_jsonb` node by node → each node writes
`workflow_run_steps` + `events` → workflow report aggregates.

## External Integrations
| Service | Purpose | Auth method |
|---------|---------|-------------|
| Google Places API | Lead sourcing by industry/location | API key (server-side) |
| Email provider (Resend/Postmark) | Transactional sends + webhooks | API key |
| Gmail/Outlook (Nylas or direct) | Per-user mailbox for cold outreach | OAuth per user |
| Inngest | Durable job execution | Signing key |
| Enrichment (website scrape / Hunter) | Fill missing emails | key if provider used |

## Key Architecture Decisions
| Decision | Choice | Rationale | Trade-off |
|----------|--------|-----------|-----------|
| Reporting source | Single append-only `events` table | Both report types are aggregations over one log | Must design event taxonomy carefully |
| Segment dynamic | JSONB filter, live-resolved + scheduled re-eval | Auto-updating audiences | Query cost; needs indexing |
| Workflow model | JSONB node/edge graph executed by Inngest | Flexible visual automations | Graph validation complexity |
| Sequences | Inngest durable steps | Multi-day delays + retries survive restarts | External dependency |
| Tenancy | `org_id` + RLS on every table | DB-enforced isolation | Every query/policy must include org scope |

## Security Model
- Auth: Supabase Auth; every table has `org_id` + RLS policy tied to membership.
- Secrets: Places key, provider keys, OAuth tokens in Supabase Vault / env — never client-side.
- Attack surface: API route handlers (validate with zod), provider webhooks (verify signatures).
- PII: prospect contact data; honor unsubscribe + deletion; encrypt OAuth tokens at rest.

## Scalability Considerations
- Scraping and sending are I/O-bound → offloaded to Inngest with concurrency limits + throttling.
- Dynamic segment re-eval batched on schedule, not per-request.
- Events table partitioned by time / rolled into summary tables if volume grows.
