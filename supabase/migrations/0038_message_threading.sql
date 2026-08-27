-- Handshake — RFC 822 threading on messages.
--
-- Outbound email now carries a Message-ID we generate, plus In-Reply-To and
-- References built from the thread's earlier messages, so a reply we send lands
-- in the same thread in the recipient's mail client (Zendesk-style) instead of
-- opening a fresh one. Inbound stores the sender's Message-ID + In-Reply-To so
-- the webhook can resolve the *thread* from the header chain rather than only
-- guessing from the sender address.
--
-- `provider_message_id` is left alone: it stays the delivery provider's own id
-- (Resend / Gmail / synthesized), which the events funnel correlates on.

alter table messages
  add column if not exists message_id  text,
  add column if not exists in_reply_to text;

-- Header ids are unique per org (they embed a uuid), and the inbound webhook
-- looks a parent up by exactly this pair.
create unique index if not exists messages_org_message_id_idx
  on messages(org_id, message_id) where message_id is not null;
