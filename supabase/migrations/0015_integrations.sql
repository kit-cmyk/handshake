-- Handshake — Integrations: per-org third-party connections (Slack first).
-- One row per (org, type). `config` holds type-specific settings, e.g. for Slack:
--   { "webhook_url": "https://hooks.slack.com/services/…",
--     "events": ["reply","deal_won","campaign_finished"] }
-- `enabled` is the master on/off so a config can be kept but muted.

create table if not exists org_integrations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  type        text not null check (type in ('slack')),
  config      jsonb not null default '{}'::jsonb,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, type)
);
create index if not exists org_integrations_org_idx on org_integrations(org_id);

-- updated_at trigger (reuses set_updated_at from 0001)
drop trigger if exists set_updated_at on org_integrations;
create trigger set_updated_at before update on org_integrations
  for each row execute function set_updated_at();

-- RLS — org-scoped; the service-role client (webhooks/Inngest) bypasses this to
-- read a target org's Slack config when dispatching notifications.
alter table org_integrations enable row level security;

drop policy if exists org_integrations_all on org_integrations;
create policy org_integrations_all on org_integrations for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));
