-- Handshake — expiring team invitations.
--
-- Invitations had no expiry: accept_invitation only checked status='pending',
-- so a leaked invite link was valid forever until manually revoked (the invite
-- UI even implied links could expire). Add a 14-day expiry and enforce it on
-- acceptance.
-- ---------------------------------------------------------------------------

alter table invitations
  add column if not exists expires_at timestamptz not null default (now() + interval '14 days');

-- Give any existing pending invites a window from now.
update invitations
  set expires_at = now() + interval '14 days'
  where status = 'pending' and expires_at <= now();

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
