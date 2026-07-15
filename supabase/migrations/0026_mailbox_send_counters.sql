-- Handshake — atomic per-mailbox daily send counter.
--
-- The campaign engine's daily send cap previously counted `sent` events and
-- then decided whether to send. Under concurrency (up to 20 enrollment runs in
-- flight) every run read the same count and all passed the check, so a mailbox
-- could exceed its daily_limit by the number of concurrent runs. This table +
-- RPC turn the check into an atomic reserve-a-slot operation.

create table if not exists mailbox_send_counters (
  org_id     uuid not null references organizations(id) on delete cascade,
  mailbox_id uuid not null references mailboxes(id) on delete cascade,
  day        date not null,
  count      integer not null default 0,
  primary key (org_id, mailbox_id, day)
);

-- Written only by the service-role engine (via the RPC below). Enable RLS with
-- no policies so the anon/authenticated clients are default-denied.
alter table mailbox_send_counters enable row level security;

-- Atomically reserve one send slot for a mailbox on the current UTC day.
-- Returns true if a slot was reserved (caller may send), false if the mailbox
-- has hit its cap for the day. The upsert takes a row lock on conflict, so
-- concurrent callers serialize and the count can never exceed the limit.
create or replace function reserve_mailbox_send(
  p_org uuid,
  p_mailbox uuid,
  p_limit integer
)
returns boolean
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

  if v_count > p_limit then
    -- Over cap: roll back the reservation we just made.
    update mailbox_send_counters
      set count = count - 1
      where org_id = p_org and mailbox_id = p_mailbox and day = v_day;
    return false;
  end if;

  return true;
end;
$$;
