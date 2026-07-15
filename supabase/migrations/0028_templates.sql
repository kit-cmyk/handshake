-- Handshake — reusable template library.
--
-- One table holds curated-adjacent, org-owned templates of three kinds:
--   email    — a reusable subject + body snippet
--   campaign — a full multi-step sequence
--   workflow — a trigger + node graph
-- `content` is a jsonb whose shape depends on `kind` (validated in app code):
--   email    -> { subject, body }
--   campaign -> { stop_on_reply, steps: [{ subject, body, wait_minutes, stop_on_reply }] }
--   workflow -> { trigger_type, graph }
-- Curated/built-in templates live in code (src/lib/templates/curated.ts); this
-- table stores only the ones users save themselves.

create table if not exists templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  kind        text not null check (kind in ('email', 'campaign', 'workflow')),
  name        text not null,
  description text,
  content     jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists templates_org_kind_idx
  on templates(org_id, kind, created_at desc);

-- updated_at trigger (shared helper from 0001_init)
drop trigger if exists set_updated_at on templates;
create trigger set_updated_at before update on templates
  for each row execute function set_updated_at();

-- RLS — org-scoped, same pattern as the rest of the schema.
alter table templates enable row level security;

drop policy if exists templates_all on templates;
create policy templates_all on templates for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));
