-- Handshake — E9: Inbox (unified conversations + two-way email threads)
--
-- Adds a per-contact email conversation store so the team can read and reply to
-- real threads from one place, alongside the existing activity + event timeline.
-- One open conversation per (contact, channel); inbound bodies are captured by
-- the inbound webhook (which uses the service-role client and bypasses RLS).
-- All tables are org-scoped and follow the auth_org_ids() RLS pattern from 0001.

-- ---------------------------------------------------------------------------
-- conversations — one email thread per contact (GoHighLevel-style collapse).
-- ---------------------------------------------------------------------------
create table if not exists conversations (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references organizations(id) on delete cascade,
  contact_id              uuid not null references contacts(id) on delete cascade,
  -- Denormalized from the contact so the Companies tab and company filters are
  -- a single-table read; kept in sync by the app on contact reassignment.
  company_id              uuid references companies(id) on delete set null,
  channel                 text not null default 'email' check (channel in ('email')),
  subject                 text,
  status                  text not null default 'open' check (status in ('open','closed')),
  assignee_id             uuid references auth.users(id) on delete set null,
  last_message_at         timestamptz,
  last_message_snippet    text,
  last_message_direction  text check (last_message_direction in ('inbound','outbound')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (org_id, contact_id, channel)
);
create index if not exists conversations_org_recent_idx
  on conversations(org_id, last_message_at desc);
create index if not exists conversations_org_status_idx on conversations(org_id, status);
create index if not exists conversations_company_idx on conversations(company_id);
create index if not exists conversations_contact_idx on conversations(contact_id);
create index if not exists conversations_org_assignee_idx on conversations(org_id, assignee_id);

-- ---------------------------------------------------------------------------
-- messages — individual inbound/outbound emails within a conversation.
-- ---------------------------------------------------------------------------
create table if not exists messages (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) on delete cascade,
  conversation_id      uuid not null references conversations(id) on delete cascade,
  contact_id           uuid references contacts(id) on delete set null, -- denormalized
  direction            text not null check (direction in ('inbound','outbound')),
  channel              text not null default 'email' check (channel in ('email')),
  from_address         text,
  to_address           text,
  subject              text,
  body_html            text,
  body_text            text,
  snippet              text,            -- short preview for the list row
  user_id              uuid references auth.users(id) on delete set null, -- sender (outbound)
  provider_message_id  text,            -- correlate with events.metadata->>message_id
  campaign_id          uuid references campaigns(id) on delete set null,
  created_at           timestamptz not null default now()
);
create index if not exists messages_conversation_idx on messages(conversation_id, created_at);
create index if not exists messages_org_created_idx on messages(org_id, created_at);
create index if not exists messages_provider_idx
  on messages(org_id, provider_message_id) where provider_message_id is not null;

-- ---------------------------------------------------------------------------
-- conversation_reads — per-user read state. A conversation is unread for a user
-- when its last inbound message arrived after that user's last_read_at.
-- ---------------------------------------------------------------------------
create table if not exists conversation_reads (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  unique (conversation_id, user_id)
);
create index if not exists conversation_reads_user_idx
  on conversation_reads(user_id, conversation_id);

-- ---------------------------------------------------------------------------
-- Keep conversations.last_message_* in sync however a message is inserted
-- (server action for outbound, webhook for inbound) — one source of truth.
-- ---------------------------------------------------------------------------
create or replace function bump_conversation_on_message()
returns trigger language plpgsql as $$
begin
  update conversations set
    last_message_at        = new.created_at,
    last_message_snippet   = new.snippet,
    last_message_direction = new.direction,
    -- An inbound reply reopens a closed thread, mirroring HubSpot/GHL behavior.
    status                 = case when new.direction = 'inbound' then 'open' else status end,
    updated_at             = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists bump_conversation_on_message on messages;
create trigger bump_conversation_on_message after insert on messages
  for each row execute function bump_conversation_on_message();

-- updated_at trigger for conversations (reuses set_updated_at from 0001)
drop trigger if exists set_updated_at on conversations;
create trigger set_updated_at before update on conversations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security — org-scoped, matching the rest of the schema.
-- ---------------------------------------------------------------------------
alter table conversations      enable row level security;
alter table messages           enable row level security;
alter table conversation_reads enable row level security;

do $$
declare t text;
begin
  foreach t in array array['conversations','messages','conversation_reads']
  loop
    execute format('drop policy if exists %1$s_all on %1$I;', t);
    execute format(
      'create policy %1$s_all on %1$I for all
         using (org_id in (select auth_org_ids()))
         with check (org_id in (select auth_org_ids()));', t);
  end loop;
end $$;
