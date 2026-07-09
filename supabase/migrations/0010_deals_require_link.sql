-- Handshake — deals must be linked to a contact and/or a company.
-- A deal is an opportunity with someone; a fully unattached deal is a data-quality
-- hole (no way to email, call, or report on it). Require at least one link.

-- Backfill guard: if any legacy rows are unattached they would violate the
-- constraint. We leave them for manual triage rather than deleting silently —
-- add the constraint as NOT VALID so it enforces new/updated rows immediately
-- and existing rows can be reconciled, then validated.
alter table deals
  add constraint deals_contact_or_company_chk
  check (contact_id is not null or company_id is not null) not valid;

-- Validate once the workspace confirms no orphan deals remain:
--   alter table deals validate constraint deals_contact_or_company_chk;
