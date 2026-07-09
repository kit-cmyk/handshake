-- Handshake — E2b: import batches (audit trail for CSV/manual imports)

create table if not exists import_batches (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  target      text not null check (target in ('contacts','companies')),
  source      text,                 -- label, e.g. 'csv'
  filename    text,
  total       integer not null default 0,
  created     integer not null default 0,
  updated     integer not null default 0,
  skipped     integer not null default 0,
  errored     integer not null default 0,
  errors      jsonb,                -- [{ row: int, message: text }]
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists import_batches_org_idx on import_batches(org_id, created_at desc);

alter table import_batches enable row level security;

drop policy if exists import_batches_all on import_batches;
create policy import_batches_all on import_batches for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));
