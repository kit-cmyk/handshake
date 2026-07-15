-- Handshake — close in-org privilege escalation via invitations.
--
-- Before: `invitations_all` allowed ANY org member to INSERT an invitation
-- scoped only by org_id. Since accept_invitation() grants exactly inv.role, a
-- plain member could insert a role='owner' invite to their own email (directly
-- via PostgREST + the anon key, bypassing the UI) and accept it to become owner.
--
-- After: members may still READ their org's invitations, but only owners/admins
-- may create, update, or revoke them.
-- ---------------------------------------------------------------------------

-- Orgs where the current user is an owner or admin (security definer to avoid
-- RLS recursion on memberships), mirroring auth_org_ids().
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

drop policy if exists invitations_all on invitations;

-- Any member of the org can see its pending/accepted invitations.
drop policy if exists invitations_select on invitations;
create policy invitations_select on invitations for select
  using (org_id in (select auth_org_ids()));

-- Only owners/admins may create, modify, or revoke invitations.
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
