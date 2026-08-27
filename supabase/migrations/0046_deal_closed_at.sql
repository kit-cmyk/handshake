-- Handshake — when a deal was closed, and the aggregates the dashboard needs.
--
-- `deals` records that a deal is won or lost, but never when it happened. The
-- only dates on the row are `close_date` (user-entered, nullable, and routinely
-- left empty) and `updated_at` (bumped by any edit, so it drifts away from the
-- close the moment someone fixes a typo). Neither can date revenue: a deal won
-- without someone filling in close_date would simply vanish from the month it
-- was won in, and every revenue figure would silently under-report.
--
-- `closed_at` is set by the database at the moment status leaves 'open', so it
-- is correct however the deal was closed — the board, the edit form, an import,
-- or a future API — and cannot be forgotten.
-- ---------------------------------------------------------------------------

alter table deals add column if not exists closed_at timestamptz;

create or replace function set_deal_closed_at()
returns trigger language plpgsql as $$
begin
  -- Closing: stamp the moment it happened. On INSERT there is no OLD row, so a
  -- deal created already won (an import of historical business) stamps too.
  if new.status in ('won','lost')
     and coalesce(old.status, 'open') = 'open' then
    new.closed_at = coalesce(new.closed_at, now());
  -- Reopening: it is no longer closed, so it must not count toward any month.
  elsif new.status = 'open' then
    new.closed_at = null;
  end if;
  -- Deliberately no branch for won -> lost (or lost -> won): the deal closed
  -- once, and re-deciding the outcome does not move the date it closed on.
  return new;
end;
$$;

drop trigger if exists set_deal_closed_at on deals;
create trigger set_deal_closed_at before insert or update on deals
  for each row execute function set_deal_closed_at();

-- Backfill, so existing history charts instead of starting from today. Prefer
-- the date a human recorded; fall back to updated_at, which for an untouched
-- closed deal is the close itself.
--
-- This is APPROXIMATE and only ever runs once: updated_at drifts the moment
-- anyone edits a closed deal, so a month that predates this migration is a
-- reconstruction, not a record. Everything closed from here on is exact.
update deals
   set closed_at = coalesce(close_date::timestamptz, updated_at)
 where status <> 'open'
   and closed_at is null;

create index if not exists deals_org_closed_at_idx
  on deals(org_id, closed_at) where closed_at is not null;

-- The dashboard's task queue reads open, dated activities and nothing else, so
-- a partial index matching that predicate exactly keeps it off a table scan.
-- `activities` only had activities_org_contact_idx, which this query can't use.
create index if not exists activities_org_due_idx
  on activities(org_id, due_at)
  where done_at is null and due_at is not null;

-- ---------------------------------------------------------------------------
-- Dashboard aggregates.
--
-- Same reasoning as 0042: PostgREST caps a SELECT at 1000 rows and returns no
-- error, so summing deal values in the app silently under-reports the moment a
-- workspace passes 1000 deals. These push the arithmetic into Postgres, where
-- each view returns one row per group rather than one row per deal.
--
-- `security_invoker = true` runs each view as the querying user, so the
-- existing org-scoped RLS on `deals` and `stages` applies unchanged.
-- ---------------------------------------------------------------------------

-- Deal count and value per status. Powers revenue-won, open-pipeline and the
-- win rate — all three read from this one view.
create or replace view deal_value_totals
  with (security_invoker = true) as
select
  org_id,
  status,
  count(*)::int as deals,
  coalesce(sum(value), 0)::numeric as value,
  -- Deals with no value at all. They belong in the count but contribute
  -- nothing to the sum, so a total is only honest alongside this.
  count(*) filter (where value is null)::int as missing_value
from deals
group by org_id, status;

-- Open deals per stage, for the pipeline bars. Carries `position` so the
-- caller orders stages the way the pipeline does rather than alphabetically.
create or replace view deal_stage_totals
  with (security_invoker = true) as
select
  d.org_id,
  d.stage_id,
  s.pipeline_id,
  s.name as stage,
  s.position,
  count(*)::int as deals,
  coalesce(sum(d.value), 0)::numeric as value
from deals d
join stages s on s.id = d.stage_id
where d.status = 'open'
group by d.org_id, d.stage_id, s.pipeline_id, s.name, s.position;

-- Closed value by month — the only view in the app with a time dimension, and
-- the one the revenue trend is drawn from. Grouped by status so won and lost
-- can be told apart (and a lost-revenue series added later without a migration).
--
-- date_trunc runs in the session timezone, which is UTC under PostgREST, so
-- callers MUST compute their month boundaries in UTC too. Mixing a local-time
-- "this month" with these buckets makes the headline figure and the chart
-- disagree for a few hours either side of every month boundary.
create or replace view deal_revenue_by_month
  with (security_invoker = true) as
select
  org_id,
  date_trunc('month', closed_at)::date as month,
  status,
  count(*)::int as deals,
  coalesce(sum(value), 0)::numeric as value
from deals
where closed_at is not null
group by org_id, date_trunc('month', closed_at), status;

-- Contact lifecycle distribution. At most 5 rows per org.
create or replace view contact_lifecycle_counts
  with (security_invoker = true) as
select
  org_id,
  lifecycle_stage,
  count(*)::int as contacts
from contacts
group by org_id, lifecycle_stage;

-- Views need their own grants; RLS on the base tables still does the filtering.
grant select on deal_value_totals     to authenticated, service_role;
grant select on deal_stage_totals     to authenticated, service_role;
grant select on deal_revenue_by_month to authenticated, service_role;
grant select on contact_lifecycle_counts to authenticated, service_role;
