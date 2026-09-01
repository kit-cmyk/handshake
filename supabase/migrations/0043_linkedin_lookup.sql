-- Handshake — background LinkedIn backfill bookkeeping.
--
-- Find leads only sees a LinkedIn page when the business links it from its
-- homepage (companies) or the people-search provider returns one (contacts).
-- Anything else is backfilled later by a background job that crawls the site
-- more deeply and, if configured, searches the web.
--
-- linkedin_lookup_at stamps the last ATTEMPT (hit or miss) so the nightly sweep
-- doesn't re-crawl the same dead ends every night — without it, records that
-- genuinely have no LinkedIn page would be retried forever.

alter table companies
  add column if not exists linkedin_lookup_at timestamptz;

alter table contacts
  add column if not exists linkedin_lookup_at timestamptz;

-- The sweep's working set: rows still missing a LinkedIn URL. Partial indexes so
-- they stay small — a fully-enriched workspace indexes nothing.
create index if not exists companies_linkedin_pending_idx
  on companies(org_id, linkedin_lookup_at)
  where linkedin_url is null;

create index if not exists contacts_linkedin_pending_idx
  on contacts(org_id, linkedin_lookup_at)
  where linkedin_url is null;
