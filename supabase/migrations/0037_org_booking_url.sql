-- Handshake — org-wide booking link.
--
-- A single scheduling URL (Calendly, cal.com, etc.) the workspace shares. It
-- surfaces in outbound email as the {{booking_link}} merge token so "Book a
-- time" CTAs in templates, campaigns, and workflows fill automatically. Nullable
-- so existing orgs keep working; an empty token renders to nothing.

alter table organizations
  add column if not exists booking_url text;
