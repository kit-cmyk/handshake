# Handshake — Database Schema (v1 draft)
Status: DRAFT for review | Date: 2026-07-08 | Migration tool: Supabase migrations

> All tables include `org_id uuid not null` (RLS) + `created_at`, `updated_at`.
> PK = `id uuid default gen_random_uuid()` unless noted.

## Tenancy & Users
### organizations
| Field | Type | Null | Notes |
|-------|------|------|-------|
| id | uuid | no | PK |
| name | text | no | |

### memberships
| Field | Type | Null | Notes |
|-------|------|------|-------|
| user_id | uuid | no | FK auth.users |
| org_id | uuid | no | FK organizations |
| role | text | no | owner/admin/member |

## CRM Core
### companies  (the local businesses)
| Field | Type | Null | Notes |
|-------|------|------|-------|
| name | text | no | |
| category | text | yes | industry/business type (Places type) |
| phone | text | yes | |
| website | text | yes | |
| address / city / region / postal | text | yes | |
| google_place_id | text | yes | unique per org; dedupe key (local persona) |
| rating | numeric | yes | from Places |
| industry | text | yes | firmographic (B2B persona) |
| employee_count | int | yes | firmographic (B2B) |
| annual_revenue | numeric | yes | firmographic (B2B) |
| linkedin_url | text | yes | firmographic (B2B) |
| domain | text | yes | dedupe key for imported B2B companies |
| source | text | yes | scrape/import/manual/csv |

Indexes: `(org_id, google_place_id)` unique; `(org_id, domain)`; `(org_id, category)`;
`(org_id, industry)`; `(org_id, city)`.

> Dedupe strategy: local-services matches on `google_place_id`; B2B/imported matches
> on `domain` (company) and `email` (contact). Import upserts respect both.

### contacts  (people / leads; may be company-level for local biz)
| Field | Type | Null | Notes |
|-------|------|------|-------|
| company_id | uuid | yes | FK companies |
| first_name / last_name | text | yes | often unknown for local biz |
| email | text | yes | best-effort (enrichment) |
| phone | text | yes | |
| title | text | yes | |
| lifecycle_stage | text | no | new/contacted/qualified/won/lost |
| owner_id | uuid | yes | FK memberships/users |
| source | text | yes | |
| unsubscribed_at | timestamptz | yes | suppression |

Indexes: `(org_id, email)`; `(org_id, lifecycle_stage)`; `(org_id, owner_id)`.

### pipelines / stages / deals
- **pipelines**: name
- **stages**: pipeline_id, name, position
- **deals**: contact_id, company_id, pipeline_id, stage_id, value numeric, status
  (open/won/lost), close_date

### activities
type (call/note/task/email), contact_id, deal_id?, body, due_at, done_at, user_id.

## Segments
### segments
| Field | Type | Null | Notes |
|-------|------|------|-------|
| name | text | no | |
| type | text | no | 'static' \| 'dynamic' |
| definition_jsonb | jsonb | yes | filter rules (dynamic) |
| last_evaluated_at | timestamptz | yes | dynamic re-eval stamp |

### segment_members  (static membership)
segment_id, contact_id. Unique `(segment_id, contact_id)`.

## Campaigns  → funnel report source
### campaigns
name, status (draft/active/paused/archived), segment_id, mailbox_id.

### campaign_steps
campaign_id, position, channel ('email'), subject, body_template, delay_minutes.

### campaign_enrollments
campaign_id, contact_id, status (active/completed/replied/bounced/unsubscribed/stopped),
current_step_position, enrolled_at. Unique `(campaign_id, contact_id)`.

## Workflows  → workflow report source
### workflows
name, status, trigger_type (segment_entry/reply/stage_change/manual),
trigger_config_jsonb, graph_jsonb (nodes + edges).

### workflow_runs
workflow_id, contact_id, status (active/completed/failed/stopped), started_at, ended_at.

### workflow_run_steps
run_id, node_id, status (entered/completed/skipped/failed), entered_at, completed_at.

## Events  (append-only — powers ALL reports)
| Field | Type | Null | Notes |
|-------|------|------|-------|
| type | text | no | sent/delivered/opened/clicked/replied/bounced/unsubscribed/booked/node_executed |
| contact_id | uuid | yes | |
| campaign_id | uuid | yes | |
| campaign_step_id | uuid | yes | funnel grouping |
| workflow_id | uuid | yes | |
| workflow_node_id | text | yes | workflow grouping |
| metadata_jsonb | jsonb | yes | provider ids, urls, etc. |
| occurred_at | timestamptz | no | |

Indexes: `(org_id, campaign_step_id, type)`; `(org_id, workflow_id, type)`; `(org_id, occurred_at)`.

## Infra tables
- **mailboxes**: user_id, provider, email, oauth tokens (encrypted), warmup_state, daily_limit
- **scrape_jobs**: query (category, location, radius), status, requested/imported/deduped counts
- **import_batches**: source, counts, created_by

## Reporting queries (illustrative)
- **Campaign funnel**: `select campaign_step_id, type, count(distinct contact_id) from events where campaign_id=? group by 1,2` → pivot to sent→open→click→reply→booked per step.
- **Workflow report**: `workflow_runs` by status + `workflow_run_steps` grouped by node_id for per-node completion & avg (completed_at - entered_at).

## Seed data
- Default pipeline + stages (New → Contacted → Qualified → Proposal → Won/Lost)
- Default lifecycle stages
