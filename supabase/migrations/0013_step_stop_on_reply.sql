-- Handshake — E5+: per-step stop-on-reply override
--   campaign_steps.stop_on_reply:
--     null  → inherit the campaign-level campaigns.stop_on_reply (default)
--     true  → a reply to this step always stops the sequence
--     false → a reply to this step never stops the sequence

alter table campaign_steps
  add column if not exists stop_on_reply boolean;
