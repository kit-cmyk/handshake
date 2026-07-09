-- Handshake — workflows become the single automation / trigger surface.
-- Enrollment triggering moves off campaigns and onto workflows (GoHighLevel-style
-- triggers + conditions + actions). Two follow-on effects:
--   1. Workflow trigger types gain the campaign parity trigger (activity_logged)
--      plus the engagement triggers email_opened / email_clicked.
--   2. Campaigns are now entered manually or via a workflow's "Enroll in
--      campaign" action, so their own trigger / auto-enroll columns are dropped.

-- 1. Widen the workflow trigger_type check.
alter table workflows drop constraint if exists workflows_trigger_type_check;
alter table workflows
  add constraint workflows_trigger_type_check
  check (trigger_type in (
    'manual','segment_entry','reply','stage_change',
    'activity_logged','email_opened','email_clicked'
  ));

-- 2. Campaigns no longer own triggers. Dropping trigger_type also drops its
--    check constraint; the partial index goes first.
drop index if exists campaigns_trigger_idx;
alter table campaigns
  drop column if exists trigger_type,
  drop column if exists trigger_config,
  drop column if exists auto_enroll;
