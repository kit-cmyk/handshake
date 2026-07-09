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
