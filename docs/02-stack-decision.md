# Handshake — Stack Decision
Status: DRAFT for review | Date: 2026-07-08

### Frontend: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
Fast to build data-dense CRM tables, forms, and builders; house stack.

### Backend: Next.js Route Handlers + Supabase
Co-located API with the app; Supabase provides Auth, Postgres, RLS, Realtime, Storage.

### Database: PostgreSQL (Supabase)
Relational fits CRM entities; JSONB for dynamic-segment filter definitions and
workflow graphs (nodes/edges).

### Job Engine: Inngest  ⭐ keystone
Durable, step-based functions power campaign sends, delays, retries, scheduling,
and workflow execution with idempotency. Do not hand-roll this.

### Auth: Supabase Auth + Row-Level Security (org_id on every table)
Multi-tenant isolation enforced at the database layer.

### Email:
- Transactional/system: Resend or Postmark (decide in E5)
- Cold outreach: per-user connected mailboxes via Gmail/Outlook OAuth (Nylas or
  direct OAuth) — required for deliverability.

### Lead sourcing:
- **Local-services persona**: Google Places API (search by business type/category +
  location) + enrichment (website scrape / Hunter) for emails.
- **B2B persona**: manual CSV/spreadsheet upload (primary, v1) with an optional B2B
  data provider (Apollo/PDL) as a fast-follow — both feed the same import pipeline.
- CSV parsing: `papaparse`; server-side validation with `zod`.

### Hosting / Infra: Vercel (app) + Supabase (data) + Inngest Cloud
### CI/CD: GitHub Actions

### Key libraries
- `@supabase/supabase-js` / `@supabase/ssr` — data + auth
- `inngest` — durable jobs
- `@tanstack/react-table` — CRM tables
- `react-flow` (@xyflow/react) — workflow visual builder
- `zod` — validation; `react-hook-form` — forms

### Alternatives considered
| Option | Reason not chosen |
|--------|-------------------|
| Supabase pg_cron/edge functions for jobs | Not durable enough for multi-day sequences + retries; more rework risk |
| Rails/Django monolith | Slower to ship the rich builder UIs; team is Next.js-first |
| Custom web scraping as primary source | ToS/legal/maintenance risk; Places is compliant |
| Shared sending domain for cold email | Poor deliverability; per-user mailboxes required |

### Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Deliverability | Per-user mailboxes, warm-up, throttling, unsubscribe, SPF/DKIM |
| Places has no emails | Enrichment step; treat email as best-effort at import |
| Job engine lock-in | Inngest logic is plain functions; portable to Trigger.dev if needed |
| Dynamic segment query cost | Index filterable columns, cap filter complexity, scheduled re-eval |
