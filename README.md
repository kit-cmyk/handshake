# Handshake

An outbound sales CRM for agencies and service businesses closing deals with local
businesses. Handshake runs the full loop: **acquire** targeted leads (by industry +
location), **organize** them, **reach** them via multi-step campaigns, **automate**
follow-up, and **measure** what converts. It's an active sales engine — think Apollo
+ Instantly + HubSpot Sequences, condensed — not a passive system of record.

It serves two personas on the same core loop:

- **Local-services seller** — agencies/providers selling to local businesses; leads
  sourced via Google Places.
- **B2B seller** — SDR/AE or founder selling nationally; leads via CSV/spreadsheet
  import (with an optional B2B data provider as a fast-follow).

## Features

- **Lead management** — contacts + companies, ownership, lifecycle, activities.
- **Import** — first-class CSV/spreadsheet upload with column mapping, dedupe, and
  validation, plus single manual add.
- **Prospecting** — find local businesses by category + location (radius, rating,
  has-website/phone, open-now) via Google Places, with a results map.
- **Segments** — static lists and dynamic, query-based audiences that auto-update.
- **Campaigns** — multi-step email sequences with a 5-step builder, per-mailbox send
  caps, tracking, and reply routing.
- **Workflows** — trigger-based automation via a visual (react-flow) builder.
- **Pipeline & deals** — drag-to-move pipeline with configurable stage → lifecycle
  mapping and in-app appointment booking.
- **Inbox** — unified conversation threads for one-off emails and inbound replies.
- **Reports** — campaign funnel (sent → opened → clicked → replied → booked) and
  per-workflow conversion, backed by an append-only events table.

Every record is scoped to an **organization** (multi-tenant, enforced by Supabase
Row-Level Security).

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js (App Router) 16, React 19, TypeScript |
| Styling | Tailwind CSS v4, shadcn/ui, Radix, Motion |
| Data / Auth | Supabase (Postgres, Auth, RLS, Storage) |
| Jobs | Inngest — durable, step-based campaign sends, delays, and workflow runs |
| Email | Resend (product email); per-user mailboxes for cold outreach |
| Lead sourcing | Google Places API; `papaparse` + `zod` for imports |
| Tables / builder | `@tanstack/react-table`, `@xyflow/react` |
| Editor | Tiptap |
| Testing | Vitest |

## Getting started

Prerequisites: Node.js 20+ and a Supabase project.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local   # then fill in the values below

# 3. Apply the database schema
#    Run supabase/migrations/*.sql in order against your Supabase project
#    (or use the Supabase CLI). See supabase/schema.sql for the full snapshot.

# 4. Run the app
npm run dev                  # http://localhost:3000
```

For durable jobs in local dev, run the Inngest Dev Server alongside `npm run dev`
(with `INNGEST_DEV=1` set, no keys required):

```bash
npx inngest-cli@latest dev
```

### Environment variables

See [.env.example](.env.example) for the annotated list. Key ones:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; used by Inngest jobs / admin tasks |
| `NEXT_PUBLIC_SITE_URL` | App base URL |
| `INNGEST_DEV` | Set to `1` for local dev; unset + provide keys in production |
| `GOOGLE_PLACES_API_KEY` | Lead prospecting |
| `EMAIL_PROVIDER_API_KEY` / `EMAIL_FROM` / `REPLY_DOMAIN` | Resend email sending |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest suite |

## Project structure

```
src/
  app/
    (app)/        Authenticated app — dashboard, contacts, companies, pipeline,
                  campaigns, workflows, segments, inbox, reports, import,
                  prospect, search, settings
    (auth)/       Sign-in / sign-up
    api/          Route handlers (webhooks, tracking pixels, Inngest endpoint)
    onboarding/   New-org setup
  components/     UI + feature components
  lib/            Supabase clients, Inngest functions, email, places, lifecycle…
supabase/
  migrations/     Ordered SQL migrations (source of truth for schema changes)
  schema.sql      Full schema snapshot
  templates/      Branded auth email templates
docs/             Product context, stack decision, architecture, DB schema, plan
TODO.md           Running log of deferred work and future features
```

## Documentation

Design and planning docs live in [`docs/`](docs/):

- [Product context](docs/01-product-context.md)
- [Stack decision](docs/02-stack-decision.md)
- [Architecture](docs/03-architecture.md)
- [DB schema](docs/04-db-schema.md)
- [Implementation status](docs/06-implementation-status.md)
- [Design system](docs/07-design-system.md)

> **Note:** This project pins a version of Next.js with breaking changes from prior
> releases. Consult the bundled guides in `node_modules/next/dist/docs/` before
> writing framework code — see [AGENTS.md](AGENTS.md).
