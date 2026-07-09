-- Handshake — E5: campaigns, sequences, enrollment, events, suppressions, mailboxes

-- Sending identities. Real OAuth (Gmail/Outlook) deferred; provider 'mock' in dev.
create table if not exists mailboxes (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  provider     text not null default 'mock',
  email        text not null,
  display_name text,
  daily_limit  integer not null default 200,
  status       text not null default 'active' check (status in ('active','disabled')),
  created_at   timestamptz not null default now()
);
create index if not exists mailboxes_org_idx on mailboxes(org_id);

create table if not exists campaigns (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  status      text not null default 'draft'
                check (status in ('draft','active','paused','archived')),
  segment_id  uuid references segments(id) on delete set null,
  mailbox_id  uuid references mailboxes(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists campaigns_org_idx on campaigns(org_id, created_at desc);

create table if not exists campaign_steps (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  position      integer not null default 0,
  channel       text not null default 'email',
  subject       text,
  body          text,
  wait_minutes  integer not null default 0,   -- delay BEFORE sending this step
  created_at    timestamptz not null default now()
);
create index if not exists campaign_steps_campaign_idx
  on campaign_steps(campaign_id, position);

create table if not exists campaign_enrollments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  contact_id    uuid not null references contacts(id) on delete cascade,
  status        text not null default 'active'
                  check (status in ('active','completed','replied','bounced','unsubscribed','stopped')),
  current_step  integer not null default 0,
  enrolled_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (campaign_id, contact_id)
);
create index if not exists enrollments_campaign_idx
  on campaign_enrollments(campaign_id, status);

-- Append-only event log — the single source of truth for funnel reports (E7)
-- and workflow reports (E8). workflow_* columns are used later.
create table if not exists events (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  type              text not null,
  contact_id        uuid references contacts(id) on delete set null,
  campaign_id       uuid references campaigns(id) on delete set null,
  campaign_step_id  uuid references campaign_steps(id) on delete set null,
  workflow_id       uuid,
  workflow_node_id  text,
  metadata          jsonb,
  occurred_at       timestamptz not null default now()
);
create index if not exists events_campaign_type_idx
  on events(org_id, campaign_id, type);
create index if not exists events_step_type_idx
  on events(org_id, campaign_step_id, type);
create index if not exists events_occurred_idx on events(org_id, occurred_at);

create table if not exists suppressions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  email       text not null,
  reason      text,
  contact_id  uuid references contacts(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (org_id, email)
);
create index if not exists suppressions_org_idx on suppressions(org_id, email);

-- updated_at trigger for campaigns
drop trigger if exists set_updated_at on campaigns;
create trigger set_updated_at before update on campaigns
  for each row execute function set_updated_at();

-- RLS (all org-scoped; background jobs & webhooks use the service-role client)
alter table mailboxes            enable row level security;
alter table campaigns            enable row level security;
alter table campaign_steps       enable row level security;
alter table campaign_enrollments enable row level security;
alter table events               enable row level security;
alter table suppressions         enable row level security;

do $$
declare t text;
begin
  foreach t in array array['mailboxes','campaigns','campaign_steps',
                           'campaign_enrollments','events','suppressions']
  loop
    execute format('drop policy if exists %1$s_all on %1$I;', t);
    execute format(
      'create policy %1$s_all on %1$I for all
         using (org_id in (select auth_org_ids()))
         with check (org_id in (select auth_org_ids()));', t);
  end loop;
end $$;
