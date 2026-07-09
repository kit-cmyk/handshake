-- Handshake — workflow status rename.
-- Workflows now use the lifecycle Draft → Running → (Paused ⇄ Running) → Ended,
-- matching the campaign model. Replaces the old 'active'/'archived' values.
--   draft   — being built, triggers dormant
--   running — live; triggers fire and runs progress
--   paused  — temporarily halted; in-flight runs resume on Resume
--   ended   — terminal; won't run again

alter table workflows drop constraint if exists workflows_status_check;
alter table workflows
  add constraint workflows_status_check
  check (status in ('draft','running','paused','ended'));
