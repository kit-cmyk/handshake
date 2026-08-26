-- Handshake — Cc / Bcc on inbox messages.
--
-- One-off inbox sends can now copy other people in. Both lists are stored on
-- the message so the thread shows who actually received it, and so a reply can
-- carry the Cc list forward (the way a ticket keeps its followers). Bcc is kept
-- for the record only — it is never rendered into a delivered header, and only
-- teammates inside the org (RLS on `messages`) can read it.
--
-- Arrays rather than a comma string: these are lists by nature, and every read
-- site wants them split.

alter table messages
  add column if not exists cc_addresses  text[],
  add column if not exists bcc_addresses text[];
