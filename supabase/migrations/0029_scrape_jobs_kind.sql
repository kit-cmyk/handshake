-- Handshake — lead search kind: businesses (companies) vs. people (contacts).
-- Existing rows are all company searches, so default to 'companies'.

alter table scrape_jobs
  add column if not exists kind text not null default 'companies'
  check (kind in ('companies','contacts'));
