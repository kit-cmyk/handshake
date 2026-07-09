-- Handshake — E6: automated workflows (trigger + node graph) + run tracking

create table if not exists workflows (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  name           text not null,
  status         text not null default 'draft'
                   check (status in ('draft','active','paused','archived')),
  trigger_type   text not null default 'manual'
                   check (trigger_type in ('manual','segment_entry','reply','stage_change')),
  trigger_config jsonb not null default '{}'::jsonb,
  mailbox_id     uuid references mailboxes(id) on delete set null,
  graph          jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists workflows_org_idx on workflows(org_id, created_at desc);
create index if not exists workflows_trigger_idx on workflows(org_id, trigger_type);

create table if not exists workflow_runs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  workflow_id   uuid not null references workflows(id) on delete cascade,
  contact_id    uuid not null references contacts(id) on delete cascade,
  status        text not null default 'active'
                  check (status in ('active','completed','failed','stopped')),
  current_node  text,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz
);
create index if not exists workflow_runs_wf_idx on workflow_runs(workflow_id, status);
-- One active run per (workflow, contact) — prevents double-enrollment.
create unique index if not exists workflow_runs_active_uq
  on workflow_runs(workflow_id, contact_id)
  where status = 'active';

create table if not exists workflow_run_steps (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  run_id        uuid not null references workflow_runs(id) on delete cascade,
  node_id       text not null,
  node_type     text,
  status        text not null default 'entered'
                  check (status in ('entered','completed','skipped','failed')),
  entered_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index if not exists workflow_run_steps_run_idx on workflow_run_steps(run_id);

-- updated_at trigger
drop trigger if exists set_updated_at on workflows;
create trigger set_updated_at before update on workflows
  for each row execute function set_updated_at();

-- RLS
alter table workflows          enable row level security;
alter table workflow_runs      enable row level security;
alter table workflow_run_steps enable row level security;

do $$
declare t text;
begin
  foreach t in array array['workflows','workflow_runs','workflow_run_steps']
  loop
    execute format('drop policy if exists %1$s_all on %1$I;', t);
    execute format(
      'create policy %1$s_all on %1$I for all
         using (org_id in (select auth_org_ids()))
         with check (org_id in (select auth_org_ids()));', t);
  end loop;
end $$;
