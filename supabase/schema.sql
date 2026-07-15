-- Handshake — full schema (migrations 0001–0008 combined)
-- Paste into Supabase → SQL Editor → Run. Idempotent (safe to re-run).

-- ============================================================
-- migrations/0001_init.sql
-- ============================================================
-- Handshake — initial schema (E1 Foundation + CRM core for E2)
-- Multi-tenant: every business table carries org_id and is protected by RLS.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Tenancy: organizations + memberships
-- ---------------------------------------------------------------------------
create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- Per-org send scheduling (see migration 0030). Defaults = always allowed.
  send_timezone     text     not null default 'UTC',
  send_window_start smallint not null default 0,
  send_window_end   smallint not null default 24,
  send_days         smallint[] not null default '{0,1,2,3,4,5,6}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint organizations_send_window_chk check (
    send_window_start >= 0 and send_window_start <= 23
    and send_window_end >= 1 and send_window_end <= 24
    and send_window_start < send_window_end
  )
);

create table if not exists memberships (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  org_id      uuid not null references organizations(id) on delete cascade,
  role        text not null default 'member' check (role in ('owner','admin','member')),
  created_at  timestamptz not null default now(),
  unique (user_id, org_id)
);
create index if not exists memberships_org_idx on memberships(org_id);
create index if not exists memberships_user_idx on memberships(user_id);

-- Helper: the set of org_ids the current auth user belongs to.
create or replace function auth_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from memberships where user_id = auth.uid();
$$;

-- Orgs where the current user is an owner or admin (for privileged policies).
create or replace function auth_admin_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from memberships
  where user_id = auth.uid() and role in ('owner', 'admin');
$$;

-- ---------------------------------------------------------------------------
-- CRM core: companies, contacts, pipelines, stages, deals, activities
-- ---------------------------------------------------------------------------
create table if not exists companies (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  name            text not null,
  category        text,            -- Places business type (local persona)
  industry        text,            -- firmographic (B2B persona)
  employee_count  integer,         -- firmographic (B2B)
  annual_revenue  numeric,         -- firmographic (B2B)
  linkedin_url    text,            -- firmographic (B2B)
  domain          text,            -- dedupe key for imported/B2B companies
  phone           text,
  website         text,
  address         text,
  city            text,
  region          text,
  postal_code     text,
  google_place_id text,            -- dedupe key (local persona)
  rating          numeric,
  latitude        double precision, -- for map plotting / radius search
  longitude       double precision,
  source          text default 'manual', -- scrape/import/manual/csv
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists companies_org_placeid_uq
  on companies(org_id, google_place_id) where google_place_id is not null;
create index if not exists companies_org_domain_idx on companies(org_id, domain);
create index if not exists companies_org_category_idx on companies(org_id, category);
create index if not exists companies_org_industry_idx on companies(org_id, industry);
create index if not exists companies_org_city_idx on companies(org_id, city);

create table if not exists contacts (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  company_id       uuid references companies(id) on delete set null,
  first_name       text,
  last_name        text,
  email            text,
  phone            text,
  title            text,
  lifecycle_stage  text not null default 'new'
                     check (lifecycle_stage in ('new','contacted','qualified','won','lost')),
  owner_id         uuid references auth.users(id) on delete set null,
  source           text default 'manual',
  lead_source      text,             -- business acquisition channel (distinct from source)
  address          text,             -- street line
  address_line2    text,             -- apt / suite / unit
  city             text,
  region           text,             -- state / province / region
  postal_code      text,             -- ZIP / postcode
  country          text,
  appointment_date date,             -- set post-creation; surfaces in list/detail
  unsubscribed_at  timestamptz,
  dismissed_issues text[] not null default '{}',  -- data-quality reasons the user chose to skip
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists contacts_org_email_idx on contacts(org_id, email);
create index if not exists contacts_org_lifecycle_idx on contacts(org_id, lifecycle_stage);
create index if not exists contacts_org_owner_idx on contacts(org_id, owner_id);
create index if not exists contacts_company_idx on contacts(company_id);

create table if not exists pipelines (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists stages (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  pipeline_id      uuid not null references pipelines(id) on delete cascade,
  name             text not null,
  position         integer not null default 0,
  -- Contact lifecycle stage a deal on this stage pushes its contact to.
  -- NULL = no mapping (leave the contact's lifecycle untouched).
  lifecycle_stage  text
                     check (lifecycle_stage is null
                            or lifecycle_stage in ('new','contacted','qualified','won','lost')),
  created_at       timestamptz not null default now()
);
create index if not exists stages_pipeline_idx on stages(pipeline_id);

create table if not exists deals (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  contact_id   uuid references contacts(id) on delete set null,
  company_id   uuid references companies(id) on delete set null,
  pipeline_id  uuid not null references pipelines(id) on delete cascade,
  stage_id     uuid not null references stages(id) on delete cascade,
  title        text not null,
  value        numeric,
  service      text,
  description  text,
  priority     text not null default 'medium' check (priority in ('low','medium','high')),
  status       text not null default 'open' check (status in ('open','won','lost')),
  close_date   date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists deals_org_stage_idx on deals(org_id, stage_id);
create index if not exists deals_org_status_idx on deals(org_id, status);

create table if not exists activities (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  type        text not null check (type in ('call','note','task','email','appointment')),
  contact_id  uuid references contacts(id) on delete cascade,
  deal_id     uuid references deals(id) on delete cascade,
  body        text,
  due_at      timestamptz,
  done_at     timestamptz,
  user_id     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists activities_org_contact_idx on activities(org_id, contact_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['organizations','companies','contacts','deals']
  loop
    execute format(
      'drop trigger if exists set_updated_at on %1$I;
       create trigger set_updated_at before update on %1$I
       for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table organizations enable row level security;
alter table memberships   enable row level security;
alter table companies     enable row level security;
alter table contacts      enable row level security;
alter table pipelines     enable row level security;
alter table stages        enable row level security;
alter table deals         enable row level security;
alter table activities    enable row level security;

-- Organizations: members can see their orgs; any authenticated user can create one.
drop policy if exists org_select on organizations;
create policy org_select on organizations for select
  using (id in (select auth_org_ids()));
drop policy if exists org_insert on organizations;
create policy org_insert on organizations for insert
  with check (auth.uid() is not null);
drop policy if exists org_update on organizations;
create policy org_update on organizations for update
  using (id in (select auth_org_ids()));

-- Memberships: a user sees their own membership rows; can insert their own.
drop policy if exists mem_select on memberships;
create policy mem_select on memberships for select
  using (user_id = auth.uid() or org_id in (select auth_org_ids()));
drop policy if exists mem_insert on memberships;
create policy mem_insert on memberships for insert
  with check (user_id = auth.uid());

-- Generic org-scoped policies for the business tables.
do $$
declare t text;
begin
  foreach t in array array['companies','contacts','pipelines','stages','deals','activities']
  loop
    execute format('drop policy if exists %1$s_all on %1$I;', t);
    execute format(
      'create policy %1$s_all on %1$I for all
         using (org_id in (select auth_org_ids()))
         with check (org_id in (select auth_org_ids()));', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- New-org bootstrap: seed a default pipeline + stages, make creator the owner.
-- Call from the app after inserting an organization.
-- ---------------------------------------------------------------------------
create or replace function create_org_with_owner(org_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  new_pipeline_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into organizations (name) values (org_name) returning id into new_org_id;
  insert into memberships (user_id, org_id, role)
    values (auth.uid(), new_org_id, 'owner');

  insert into pipelines (org_id, name) values (new_org_id, 'Sales Pipeline')
    returning id into new_pipeline_id;
  insert into stages (org_id, pipeline_id, name, position, lifecycle_stage) values
    (new_org_id, new_pipeline_id, 'New', 0, 'new'),
    (new_org_id, new_pipeline_id, 'Contacted', 1, 'contacted'),
    (new_org_id, new_pipeline_id, 'Qualified', 2, 'qualified'),
    (new_org_id, new_pipeline_id, 'Proposal', 3, 'qualified'),
    (new_org_id, new_pipeline_id, 'Won', 4, 'won'),
    (new_org_id, new_pipeline_id, 'Lost', 5, 'lost');

  return new_org_id;
end;
$$;

-- ============================================================
-- migrations/0002_import_batches.sql
-- ============================================================
-- Handshake — E2b: import batches (audit trail for CSV/manual imports)

create table if not exists import_batches (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  target      text not null check (target in ('contacts','companies')),
  source      text,                 -- label, e.g. 'csv'
  filename    text,
  total       integer not null default 0,
  created     integer not null default 0,
  updated     integer not null default 0,
  skipped     integer not null default 0,
  errored     integer not null default 0,
  errors      jsonb,                -- [{ row: int, message: text }]
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists import_batches_org_idx on import_batches(org_id, created_at desc);

alter table import_batches enable row level security;

drop policy if exists import_batches_all on import_batches;
create policy import_batches_all on import_batches for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

-- ============================================================
-- migrations/0003_segments.sql
-- ============================================================
-- Handshake — E3: segments (static + dynamic) + membership

create table if not exists segments (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  name              text not null,
  type              text not null check (type in ('static','dynamic')),
  definition        jsonb not null default '{"match":"all","rules":[]}'::jsonb,
  last_evaluated_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists segments_org_idx on segments(org_id, created_at desc);

-- Membership: fixed snapshot for static; refreshed cache for dynamic.
create table if not exists segment_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  segment_id  uuid not null references segments(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (segment_id, contact_id)
);
create index if not exists segment_members_segment_idx on segment_members(segment_id);
create index if not exists segment_members_contact_idx on segment_members(contact_id);

-- updated_at trigger for segments (reuses set_updated_at from 0001)
drop trigger if exists set_updated_at on segments;
create trigger set_updated_at before update on segments
  for each row execute function set_updated_at();

-- RLS
alter table segments enable row level security;
alter table segment_members enable row level security;

drop policy if exists segments_all on segments;
create policy segments_all on segments for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

drop policy if exists segment_members_all on segment_members;
create policy segment_members_all on segment_members for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

-- ============================================================
-- migrations/0004_campaigns.sql
-- ============================================================
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
                check (status in ('draft','active','paused','archived','ended')),
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
                  check (status in ('active','completed','replied','bounced','unsubscribed','stopped','failed')),
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

-- ============================================================
-- migrations/0005_workflows.sql
-- ============================================================
-- Handshake — E6: automated workflows (trigger + node graph) + run tracking

create table if not exists workflows (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  name           text not null,
  status         text not null default 'draft'
                   check (status in ('draft','running','paused','ended')),
  trigger_type   text not null default 'manual'
                   check (trigger_type in (
                     'manual','segment_entry','reply','stage_change',
                     'activity_logged','email_opened','email_clicked'
                   )),
  trigger_config jsonb not null default '{}'::jsonb,
  mailbox_id     uuid references mailboxes(id) on delete set null,
  graph          jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists workflows_org_idx on workflows(org_id, created_at desc);
create index if not exists workflows_trigger_idx on workflows(org_id, trigger_type);

create table if not exists workflow_runs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  workflow_id   uuid not null references workflows(id) on delete cascade,
  contact_id    uuid not null references contacts(id) on delete cascade,
  status        text not null default 'active'
                  check (status in ('active','completed','failed','stopped')),
  current_node  text,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz
);
create index if not exists workflow_runs_wf_idx on workflow_runs(workflow_id, status);
-- One active run per (workflow, contact) — prevents double-enrollment.
create unique index if not exists workflow_runs_active_uq
  on workflow_runs(workflow_id, contact_id)
  where status = 'active';

create table if not exists workflow_run_steps (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  run_id        uuid not null references workflow_runs(id) on delete cascade,
  node_id       text not null,
  node_type     text,
  status        text not null default 'entered'
                  check (status in ('entered','completed','skipped','failed')),
  entered_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index if not exists workflow_run_steps_run_idx on workflow_run_steps(run_id);

-- updated_at trigger
drop trigger if exists set_updated_at on workflows;
create trigger set_updated_at before update on workflows
  for each row execute function set_updated_at();

-- RLS
alter table workflows          enable row level security;
alter table workflow_runs      enable row level security;
alter table workflow_run_steps enable row level security;

do $$
declare t text;
begin
  foreach t in array array['workflows','workflow_runs','workflow_run_steps']
  loop
    execute format('drop policy if exists %1$s_all on %1$I;', t);
    execute format(
      'create policy %1$s_all on %1$I for all
         using (org_id in (select auth_org_ids()))
         with check (org_id in (select auth_org_ids()));', t);
  end loop;
end $$;

-- ============================================================
-- migrations/0006_scrape_jobs.sql
-- ============================================================
-- Handshake — E4: lead scraping jobs (Google Places)

create table if not exists scrape_jobs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  provider     text not null default 'mock',   -- 'google' | 'mock'
  category     text not null,
  location     text not null,
  status       text not null default 'pending'
                 check (status in ('pending','running','completed','failed')),
  requested    integer not null default 0,      -- results returned by provider
  imported     integer not null default 0,      -- new companies created
  deduped      integer not null default 0,      -- skipped as existing
  contacts     integer not null default 0,      -- contacts created via enrichment
  errored      integer not null default 0,
  error        text,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists scrape_jobs_org_idx on scrape_jobs(org_id, created_at desc);

alter table scrape_jobs enable row level security;
drop policy if exists scrape_jobs_all on scrape_jobs;
create policy scrape_jobs_all on scrape_jobs for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

-- ============================================================
-- migrations/0007_profiles_invites.sql
-- ============================================================
-- Handshake — auth/onboarding hardening: user profiles + team invitations

-- ---------------------------------------------------------------------------
-- Profiles: per-user display info (name), readable by org teammates.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  email      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on profiles;
create trigger set_updated_at before update on profiles
  for each row execute function set_updated_at();

-- Auto-create a profile when a user signs up (name from signup metadata).
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Backfill profiles for any existing users.
insert into public.profiles (id, full_name, email)
select id, raw_user_meta_data ->> 'full_name', email
from auth.users
on conflict (id) do nothing;

alter table profiles enable row level security;

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (
    id = auth.uid()
    or id in (
      select user_id from memberships
      where org_id in (select auth_org_ids())
    )
  );

drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Invitations: invite teammates into an org by email.
-- ---------------------------------------------------------------------------
create table if not exists invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  email       text not null,
  role        text not null default 'member' check (role in ('owner','admin','member')),
  token       text not null unique,
  status      text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  expires_at  timestamptz not null default (now() + interval '14 days')
);
create index if not exists invitations_org_idx on invitations(org_id, status);
create index if not exists invitations_email_idx on invitations(lower(email));

alter table invitations enable row level security;

-- Members can read their org's invitations, but only owners/admins may create,
-- modify, or revoke them — otherwise a plain member could insert a role='owner'
-- invite and accept it to escalate. Acceptance runs via the accept_invitation()
-- RPC (security definer). See migration 0026.
drop policy if exists invitations_all on invitations;
drop policy if exists invitations_select on invitations;
create policy invitations_select on invitations for select
  using (org_id in (select auth_org_ids()));
drop policy if exists invitations_insert on invitations;
create policy invitations_insert on invitations for insert
  with check (org_id in (select auth_admin_org_ids()));
drop policy if exists invitations_update on invitations;
create policy invitations_update on invitations for update
  using (org_id in (select auth_admin_org_ids()))
  with check (org_id in (select auth_admin_org_ids()));
drop policy if exists invitations_delete on invitations;
create policy invitations_delete on invitations for delete
  using (org_id in (select auth_admin_org_ids()));

-- ---------------------------------------------------------------------------
-- Membership hardening: memberships may ONLY be created via security-definer
-- RPCs (create_org_with_owner, accept_invitation). Drop the permissive insert
-- policy that let any authenticated user join any org.
-- ---------------------------------------------------------------------------
drop policy if exists mem_insert on memberships;

create or replace function accept_invitation(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
  uid uuid := auth.uid();
  uemail text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into inv from invitations
    where token = invite_token and status = 'pending' and expires_at > now();
  if not found then
    raise exception 'invalid or expired invitation';
  end if;

  select email into uemail from auth.users where id = uid;
  if lower(uemail) <> lower(inv.email) then
    raise exception 'this invitation was sent to a different email';
  end if;

  insert into memberships (user_id, org_id, role)
  values (uid, inv.org_id, inv.role)
  on conflict (user_id, org_id) do nothing;

  update invitations
    set status = 'accepted', accepted_at = now()
    where id = inv.id;

  return inv.org_id;
end;
$$;

-- ============================================================
-- migrations/0008_storage.sql
-- ============================================================
-- Handshake — storage for email images (rich email editor uploads)

-- Public bucket so image URLs render in delivered emails.
insert into storage.buckets (id, name, public)
values ('email-assets', 'email-assets', true)
on conflict (id) do nothing;

-- Anyone can read (needed for images in sent emails).
drop policy if exists "email_assets_read" on storage.objects;
create policy "email_assets_read" on storage.objects
  for select using (bucket_id = 'email-assets');

-- Authenticated users can upload.
drop policy if exists "email_assets_insert" on storage.objects;
create policy "email_assets_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'email-assets');

-- Authenticated users can remove their uploads.
drop policy if exists "email_assets_delete" on storage.objects;
create policy "email_assets_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'email-assets');


-- ============================================================
-- migrations/0009_campaign_options.sql
-- ============================================================
alter table campaigns
  add column if not exists stop_on_reply      boolean not null default true,
  add column if not exists exclude_segment_id uuid references segments(id) on delete set null,
  add column if not exists scheduled_at       timestamptz;

create index if not exists campaigns_segment_idx
  on campaigns(segment_id) where status = 'active';

create index if not exists events_step_contact_type_idx
  on events(campaign_step_id, contact_id, type);


-- ============================================================
-- migrations/0011_workflow_enrichment.sql
-- ============================================================
alter table workflows
  add column if not exists exit_config jsonb not null default '{}'::jsonb;

create index if not exists events_workflow_type_idx
  on events(org_id, workflow_id, type);

-- ============================================================
-- migrations/0013_step_stop_on_reply.sql
-- ============================================================
alter table campaign_steps
  add column if not exists stop_on_reply boolean;

-- ============================================================
-- migrations/0023_campaign_audience.sql
-- ============================================================
alter table campaigns
  add column if not exists audience_mode text not null default 'segment'
    check (audience_mode in ('segment', 'contacts', 'import')),
  add column if not exists send_delay_minutes integer not null default 0;

-- ============================================================
-- migrations/0014_avatars.sql
-- ============================================================
alter table profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_insert" on storage.objects;
create policy "avatars_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update" on storage.objects;
create policy "avatars_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete" on storage.objects;
create policy "avatars_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- migrations/0015_integrations.sql
-- ============================================================
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

drop trigger if exists set_updated_at on org_integrations;
create trigger set_updated_at before update on org_integrations
  for each row execute function set_updated_at();

alter table org_integrations enable row level security;

drop policy if exists org_integrations_all on org_integrations;
create policy org_integrations_all on org_integrations for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

-- ---------------------------------------------------------------------------
-- Transactional contact merge — reassigns ALL related records to the primary
-- (skipping rows that would violate a per-contact unique constraint) before
-- deleting the duplicates, so a merge never silently destroys inbox threads,
-- enrollment history, or segment membership. See migration 0027.
-- ---------------------------------------------------------------------------
create or replace function merge_contacts(p_primary uuid, p_dupes uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from contacts where id = p_primary;
  if v_org is null then
    raise exception 'primary contact not found';
  end if;
  if v_org not in (select auth_org_ids()) then
    raise exception 'not authorized';
  end if;

  p_dupes := array(
    select d from unnest(p_dupes) as d
    where d <> p_primary
      and exists (select 1 from contacts c where c.id = d and c.org_id = v_org)
  );
  if array_length(p_dupes, 1) is null then
    return;
  end if;

  update activities set contact_id = p_primary where contact_id = any(p_dupes);
  update deals      set contact_id = p_primary where contact_id = any(p_dupes);
  update events     set contact_id = p_primary where contact_id = any(p_dupes);
  update messages   set contact_id = p_primary where contact_id = any(p_dupes);

  update conversations c set contact_id = p_primary
   where c.contact_id = any(p_dupes)
     and not exists (
       select 1 from conversations p
        where p.contact_id = p_primary and p.channel = c.channel
     );

  update campaign_enrollments e set contact_id = p_primary
   where e.contact_id = any(p_dupes)
     and not exists (
       select 1 from campaign_enrollments p
        where p.contact_id = p_primary and p.campaign_id = e.campaign_id
     );

  update workflow_runs r set contact_id = p_primary
   where r.contact_id = any(p_dupes)
     and not (
       r.status = 'active'
       and exists (
         select 1 from workflow_runs p
          where p.contact_id = p_primary
            and p.workflow_id = r.workflow_id
            and p.status = 'active'
       )
     );

  update segment_members m set contact_id = p_primary
   where m.contact_id = any(p_dupes)
     and not exists (
       select 1 from segment_members p
        where p.contact_id = p_primary and p.segment_id = m.segment_id
     );

  delete from contacts where id = any(p_dupes);
end;
$$;
