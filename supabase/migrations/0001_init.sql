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
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
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
  unsubscribed_at  timestamptz,
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
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  pipeline_id  uuid not null references pipelines(id) on delete cascade,
  name         text not null,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
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
  type        text not null check (type in ('call','note','task','email')),
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
  insert into stages (org_id, pipeline_id, name, position) values
    (new_org_id, new_pipeline_id, 'New', 0),
    (new_org_id, new_pipeline_id, 'Contacted', 1),
    (new_org_id, new_pipeline_id, 'Qualified', 2),
    (new_org_id, new_pipeline_id, 'Proposal', 3),
    (new_org_id, new_pipeline_id, 'Won', 4),
    (new_org_id, new_pipeline_id, 'Lost', 5);

  return new_org_id;
end;
$$;
