-- Handshake — attribute an outbound message to the workflow that sent it.
--
-- Campaign and workflow sends now record a real message row (not just a `sent`
-- event), so the Inbox thread shows what was actually sent instead of a bare
-- "Email sent" line. `campaign_id` already existed for the campaign engine;
-- this is its workflow counterpart, and it is what lets the UI tell an
-- automated send apart from one a teammate typed by hand.

alter table messages
  add column if not exists workflow_id uuid references workflows(id) on delete set null;

create index if not exists messages_workflow_idx
  on messages(workflow_id) where workflow_id is not null;
