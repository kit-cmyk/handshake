-- Handshake — workflow enrichment: exit/goal criteria.
-- `exit_config` holds optional early-exit rules evaluated per run:
--   { "onReply": true, "goalStage": "won" }
-- onReply   — stop the run when the contact replies to a workflow email.
-- goalStage — stop the run when the contact reaches this lifecycle stage.

alter table workflows
  add column if not exists exit_config jsonb not null default '{}'::jsonb;

-- Speeds up the reply/stage-change enrollment + exit lookups that scan a
-- contact's recent workflow sends by message id.
create index if not exists events_workflow_type_idx
  on events(org_id, workflow_id, type);
