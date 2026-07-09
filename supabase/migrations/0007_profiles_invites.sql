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
  accepted_at timestamptz
);
create index if not exists invitations_org_idx on invitations(org_id, status);
create index if not exists invitations_email_idx on invitations(lower(email));

alter table invitations enable row level security;

-- Org members manage their org's invitations. Acceptance runs via the
-- accept_invitation() RPC (security definer), so no public read policy needed.
drop policy if exists invitations_all on invitations;
create policy invitations_all on invitations for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

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
    where token = invite_token and status = 'pending';
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
