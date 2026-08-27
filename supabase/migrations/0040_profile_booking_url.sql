-- Handshake — per-user booking link.
--
-- Each member can point {{booking_link}} at their own calendar (Calendly,
-- cal.com, etc.). At send time the sender's link wins and the org-wide
-- organizations.booking_url (0037) is the fallback, so a workspace that shares
-- one scheduling page keeps working untouched. Nullable/blank means "use the
-- workspace link".

alter table profiles
  add column if not exists booking_url text;
