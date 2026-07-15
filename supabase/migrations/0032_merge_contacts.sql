-- Handshake — safe, transactional contact merge.
--
-- Before: the app merged contacts by reassigning only `activities` + `deals`
-- to the primary and then hard-deleting the duplicates. Because contacts
-- cascade, that silently destroyed conversations (whole inbox threads),
-- campaign_enrollments, workflow_runs, and segment_members, and orphaned
-- events/messages — none of which the confirmation copy disclosed.
--
-- After: this security-definer function reassigns ALL related records to the
-- primary in a single transaction, using ON CONFLICT / NOT EXISTS to skip rows
-- that would violate a per-contact unique constraint (those are genuine
-- duplicates and die with the duplicate contact). Runs as one atomic unit, so a
-- failure leaves the data untouched.
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
  -- Caller must be a member of the primary's org.
  if v_org not in (select auth_org_ids()) then
    raise exception 'not authorized';
  end if;

  -- Never merge a contact into itself, and only touch duplicates in the same org.
  p_dupes := array(
    select d from unnest(p_dupes) as d
    where d <> p_primary
      and exists (select 1 from contacts c where c.id = d and c.org_id = v_org)
  );
  if array_length(p_dupes, 1) is null then
    return;
  end if;

  -- History with no per-contact uniqueness: move everything.
  update activities set contact_id = p_primary where contact_id = any(p_dupes);
  update deals      set contact_id = p_primary where contact_id = any(p_dupes);
  update events     set contact_id = p_primary where contact_id = any(p_dupes);
  update messages   set contact_id = p_primary where contact_id = any(p_dupes);

  -- conversations: unique(org_id, contact_id, channel). Move a thread only when
  -- the primary has no thread on the same channel; colliding threads cascade.
  update conversations c set contact_id = p_primary
   where c.contact_id = any(p_dupes)
     and not exists (
       select 1 from conversations p
        where p.contact_id = p_primary and p.channel = c.channel
     );

  -- campaign_enrollments: unique(campaign_id, contact_id).
  update campaign_enrollments e set contact_id = p_primary
   where e.contact_id = any(p_dupes)
     and not exists (
       select 1 from campaign_enrollments p
        where p.contact_id = p_primary and p.campaign_id = e.campaign_id
     );

  -- workflow_runs: unique(workflow_id, contact_id) WHERE status='active'.
  -- Only two active runs for the same workflow collide.
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

  -- segment_members: unique(segment_id, contact_id).
  update segment_members m set contact_id = p_primary
   where m.contact_id = any(p_dupes)
     and not exists (
       select 1 from segment_members p
        where p.contact_id = p_primary and p.segment_id = m.segment_id
     );

  -- Remove the duplicates. Only the redundant colliding rows left behind above
  -- cascade away; everything distinct has already moved to the primary.
  delete from contacts where id = any(p_dupes);
end;
$$;
