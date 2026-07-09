-- Stage → lifecycle mapping
--
-- Deal pipeline and contact lifecycle are two views of the same funnel. Each
-- pipeline stage can now declare which contact lifecycle stage a deal landing on
-- it should push its contact to. This replaces hardcoded stage-name matching in
-- the app with an org-configurable mapping (Settings → Pipeline), and keeps the
-- lifecycle value — used as a condition in segments, campaigns, and workflows —
-- accurate as deals move.
--
-- NULL means "no mapping": the deal→lifecycle sync leaves the contact untouched
-- (app code falls back to name matching only when a stage has no explicit value).

alter table stages
  add column if not exists lifecycle_stage text
    check (
      lifecycle_stage is null
      or lifecycle_stage in ('new', 'contacted', 'qualified', 'won', 'lost')
    );

-- Backfill existing pipelines from their stage names so nothing regresses.
update stages
set lifecycle_stage = case lower(name)
    when 'new' then 'new'
    when 'lead' then 'new'
    when 'contacted' then 'contacted'
    when 'qualified' then 'qualified'
    when 'proposal' then 'qualified'
    when 'negotiation' then 'qualified'
    when 'won' then 'won'
    when 'lost' then 'lost'
    else null
  end
where lifecycle_stage is null;

-- Seed the mapping for new orgs' default stages alongside the stages themselves.
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
