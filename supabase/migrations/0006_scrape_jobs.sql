-- Handshake — E4: lead scraping jobs (Google Places)

create table if not exists scrape_jobs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  provider     text not null default 'mock',   -- 'google' | 'mock'
  category     text not null,
  location     text not null,
  status       text not null default 'pending'
                 check (status in ('pending','running','completed','failed')),
  requested    integer not null default 0,      -- results returned by provider
  imported     integer not null default 0,      -- new companies created
  deduped      integer not null default 0,      -- skipped as existing
  contacts     integer not null default 0,      -- contacts created via enrichment
  errored      integer not null default 0,
  error        text,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists scrape_jobs_org_idx on scrape_jobs(org_id, created_at desc);

alter table scrape_jobs enable row level security;
drop policy if exists scrape_jobs_all on scrape_jobs;
create policy scrape_jobs_all on scrape_jobs for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));
