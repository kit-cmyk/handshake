-- Handshake — terminal "failed" state for campaign enrollments.
--
-- The durable send engine can exhaust its retries on a step (e.g. a persistent
-- DB/provider error). Without a terminal failure state the enrollment stays
-- 'active' forever with current_step frozen — no process resumes it and it's
-- indistinguishable from a healthy in-flight send. The engine's onFailure
-- handler now flips such enrollments to 'failed' so they stop and surface.
-- (workflow_runs already has 'failed'.)
-- ---------------------------------------------------------------------------

alter table campaign_enrollments drop constraint if exists campaign_enrollments_status_check;
alter table campaign_enrollments
  add constraint campaign_enrollments_status_check
  check (status in ('active','completed','replied','bounced','unsubscribed','stopped','failed'));
