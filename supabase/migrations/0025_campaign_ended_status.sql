-- Terminal "ended" campaign status.
--
-- Adds 'ended' to the campaigns.status check constraint. An ended campaign has
-- been stopped for good: the app layer flips it to 'ended' and marks every
-- in-flight enrollment 'stopped' in the same action, so the durable send engine
-- (which re-checks both statuses before each send) halts and can't silently
-- resume. This is distinct from 'archived', which stays a reversible hide.
alter table campaigns drop constraint if exists campaigns_status_check;
alter table campaigns
  add constraint campaigns_status_check
  check (status in ('draft', 'active', 'paused', 'archived', 'ended'));
