-- Handshake — CRM contact sync integrations (OAuth 2.0, field-service CRMs).
--
-- Two things:
-- 1) Broaden the `org_integrations.type` check to admit the CRM connectors
--    (Jobber, Housecall Pro, ServiceTitan, QuickBooks) alongside 'slack'. One
--    row per (org, type); `config` (jsonb) holds the connection, e.g.:
--      { "oauth": { "access_token": "v1.…",   -- AES-256-GCM encrypted
--                   "refresh_token": "v1.…",   -- AES-256-GCM encrypted
--                   "expires_at": "2026-…Z" },
--        "realm_id": "…",      -- QuickBooks company id
--        "tenant_id": "…" }    -- ServiceTitan tenant id
--    A connection with `{ "mock": true }` (no OAuth app configured) runs against
--    a deterministic dev mock so the feature is exercisable without credentials.
--    Tokens are encrypted at rest by src/lib/crm/crypto.ts — never plaintext.
-- 2) `crm_sync_runs` — one row per sync (manual or scheduled), the analogue of
--    `import_batches` / `scrape_jobs`, so the UI can show sync history + counts.

alter table org_integrations drop constraint if exists org_integrations_type_check;
alter table org_integrations add constraint org_integrations_type_check
  check (type in (
    'slack',
    'hubspot', 'pipedrive', 'salesforce', 'zoho',      -- token auth
    'jobber', 'housecall', 'servicetitan', 'quickbooks' -- oauth auth
  ));

create table if not exists crm_sync_runs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  provider     text not null
                 check (provider in (
                   'hubspot', 'pipedrive', 'salesforce', 'zoho',
                   'jobber', 'housecall', 'servicetitan', 'quickbooks'
                 )),
  -- 'scheduled' rows are created by the Inngest cron; 'manual' by "Sync now".
  trigger      text not null default 'manual'
                 check (trigger in ('manual', 'scheduled')),
  mode         text not null default 'mock'      -- 'live' | 'mock'
                 check (mode in ('live', 'mock')),
  status       text not null default 'pending'
                 check (status in ('pending', 'running', 'completed', 'failed')),
  fetched      integer not null default 0,        -- contacts returned by provider
  created      integer not null default 0,        -- new contacts inserted
  updated      integer not null default 0,        -- existing contacts refreshed
  skipped      integer not null default 0,        -- returned without a usable key
  errored      integer not null default 0,
  error        text,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists crm_sync_runs_org_idx
  on crm_sync_runs(org_id, created_at desc);

alter table crm_sync_runs enable row level security;

drop policy if exists crm_sync_runs_all on crm_sync_runs;
create policy crm_sync_runs_all on crm_sync_runs for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));
