-- Campaign audience mode + send delay (5-step campaign wizard).
--
-- audience_mode records how a campaign's audience was chosen:
--   'segment'  — campaigns.segment_id points at a user-built segment.
--   'contacts' — a hand-picked contact list; segment_id points at an
--                auto-managed static segment holding those contacts.
--   'import'   — a CSV-imported contact list; same auto-managed static segment
--                mechanism as 'contacts'.
-- The auto-managed static segment is what keeps enrollment, eligibility, and
-- funnel reporting identical across all three audience modes.
--
-- send_delay_minutes backs the "At delay" send time: hold each contact's first
-- email this many minutes after enrollment (0 = send immediately). Mutually
-- exclusive with scheduled_at (a fixed calendar start).
alter table campaigns
  add column if not exists audience_mode text not null default 'segment'
    check (audience_mode in ('segment', 'contacts', 'import')),
  add column if not exists send_delay_minutes integer not null default 0;
