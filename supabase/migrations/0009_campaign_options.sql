-- Handshake — E5+: campaign enrichment options
--   stop_on_reply      : end a contact's sequence as soon as they reply
--   auto_enroll        : enroll newly-added segment members automatically
--   exclude_segment_id : never enroll contacts who belong to this segment
--   scheduled_at       : defer the first send until this time (null = immediate)

alter table campaigns
  add column if not exists stop_on_reply      boolean not null default true,
  add column if not exists auto_enroll        boolean not null default false,
  add column if not exists exclude_segment_id uuid references segments(id) on delete set null,
  add column if not exists scheduled_at       timestamptz;

-- Fast lookup of "active campaigns targeting segment X" for auto-enroll.
create index if not exists campaigns_segment_idx
  on campaigns(segment_id) where status = 'active';

-- Distinct-contact dedup / cap counting over the event log.
create index if not exists events_step_contact_type_idx
  on events(campaign_step_id, contact_id, type);
