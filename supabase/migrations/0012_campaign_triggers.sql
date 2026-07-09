-- Handshake — E5+: campaign enrollment triggers
--   trigger_type   : how contacts enter the campaign
--     manual         → enrolled on demand (default)
--     segment_entry  → auto-enrolled when they enter the audience segment
--     stage_change   → enrolled when they reach trigger_config.stage
--     activity_logged→ enrolled when an activity of trigger_config.activityType
--                      ('any' = every type) is logged for them
--   trigger_config : per-trigger settings (jsonb)

alter table campaigns
  add column if not exists trigger_type text not null default 'manual'
    check (trigger_type in ('manual','segment_entry','stage_change','activity_logged')),
  add column if not exists trigger_config jsonb not null default '{}'::jsonb;

-- Existing auto_enroll campaigns are conceptually segment-entry triggered.
update campaigns set trigger_type = 'segment_entry'
  where auto_enroll = true and trigger_type = 'manual';

create index if not exists campaigns_trigger_idx
  on campaigns(org_id, trigger_type) where status = 'active';
