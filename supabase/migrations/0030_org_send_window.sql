-- Handshake — per-org send scheduling (timezone + send window / quiet hours).
--
-- Campaign and workflow sends were scheduled purely in UTC, so mail landed at
-- arbitrary local times for the recipient's business. These columns let each
-- org pin a timezone and an allowed daily send window + weekdays; the durable
-- engines defer a send that falls outside the window to the next open slot.
--
-- Defaults reproduce the old behavior exactly: UTC, 00:00–24:00, all 7 days
-- (i.e. always allowed), so existing orgs are unaffected until they configure it.
-- ---------------------------------------------------------------------------

alter table organizations
  add column if not exists send_timezone   text     not null default 'UTC',
  add column if not exists send_window_start smallint not null default 0,
  add column if not exists send_window_end   smallint not null default 24,
  add column if not exists send_days smallint[] not null default '{0,1,2,3,4,5,6}';

alter table organizations drop constraint if exists organizations_send_window_chk;
alter table organizations
  add constraint organizations_send_window_chk
  check (
    send_window_start >= 0 and send_window_start <= 23
    and send_window_end >= 1 and send_window_end <= 24
    and send_window_start < send_window_end
  );
