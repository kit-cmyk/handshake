-- Handshake — store a contact's LinkedIn profile.
-- Companies already had linkedin_url (0001_init); people-search providers return
-- a profile URL per person and Find leads can now filter on it, so contacts need
-- somewhere to keep it instead of dropping it at import time.

alter table contacts
  add column if not exists linkedin_url text;
