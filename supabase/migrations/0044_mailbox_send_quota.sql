-- Handshake — make the internal daily send cap reflect a connected mailbox's
-- REAL provider quota, and let the app read today's usage.
--
-- Background: 0026 added `mailbox_send_counters` + `reserve_mailbox_send`, but
-- only the campaign engine ever called it. Two gaps mattered once mailboxes
-- became connected Gmail/Outlook accounts rather than Resend "from" addresses:
--
--  1. Gmail counts EVERY message the account sends against one daily quota —
--     campaign steps, workflow emails, and the replies a human types in the
--     inbox alike. Counting only campaign steps meant our number drifted below
--     the provider's, and the first thing the user saw when it ran out was a
--     provider rejection, not our cap. `record_mailbox_send` books that usage
--     without blocking: a person's own reply must never be refused because a
--     campaign spent the day's budget, but it must still be counted.
--
--  2. Nothing could read the counter — it is RLS-enabled with no policies, so
--     the settings screen had no way to show "412 of 500 sent today".

-- Book one send against today's counter WITHOUT enforcing a limit. For sends we
-- decline to block (manual replies, mailbox tests) but that still consume the
-- provider's quota. Returns the new count for the day.
create or replace function record_mailbox_send(
  p_org uuid,
  p_mailbox uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_count integer;
begin
  insert into mailbox_send_counters (org_id, mailbox_id, day, count)
  values (p_org, p_mailbox, v_day, 1)
  on conflict (org_id, mailbox_id, day)
  do update set count = mailbox_send_counters.count + 1
  returning count into v_count;
  return v_count;
end;
$$;

-- Read-only visibility for org members. Writes stay service-role-only (via the
-- two security-definer RPCs above), so the UI can display usage but nobody can
-- edit their way past a cap.
drop policy if exists mailbox_send_counters_select on mailbox_send_counters;
create policy mailbox_send_counters_select on mailbox_send_counters
  for select
  using (org_id in (select auth_org_ids()));
