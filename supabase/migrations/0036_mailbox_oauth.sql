-- Handshake — connected sending mailboxes (Gmail / Outlook via OAuth).
--
-- Until now `mailboxes` was address-only: a "from" name/email + daily cap, sent
-- through the one global delivery provider (Resend/mock). These columns let a
-- user connect their OWN Gmail or Outlook account so the app sends AS that
-- account via the provider's native API. Access/refresh tokens are long-lived
-- bearer credentials, so they are stored ENCRYPTED at the app layer (AES-256-GCM,
-- see src/lib/email/mailbox-crypto.ts) — never in the clear. All columns are
-- nullable; existing address-only rows keep working unchanged.

alter table mailboxes
  -- The authenticated account address. Gmail/Graph reject any other "from", so
  -- this is the authoritative sending identity for a connected mailbox.
  add column if not exists oauth_email text,
  -- Encrypted OAuth tokens (ciphertext strings from encryptSecret).
  add column if not exists access_token text,
  add column if not exists refresh_token text,
  -- When the access token stops working; drives proactive refresh before a send.
  add column if not exists token_expires_at timestamptz,
  -- Last auth failure (refresh/send), surfaced in the UI as "Reconnect". Null =
  -- healthy.
  add column if not exists connect_error text;

-- One connected mailbox per (org, account address). Re-connecting the same
-- account updates the tokens in place rather than creating duplicates. Partial
-- so it never constrains the many address-only rows (oauth_email is null there).
create unique index if not exists mailboxes_org_oauth_email_uniq
  on mailboxes (org_id, oauth_email)
  where oauth_email is not null;
