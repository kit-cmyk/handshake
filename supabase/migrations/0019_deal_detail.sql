-- Handshake — deal detail: richer deal fields + appointment activities.

alter table deals
  add column if not exists service     text,
  add column if not exists description text,
  add column if not exists priority    text not null default 'medium'
    check (priority in ('low', 'medium', 'high'));

-- Allow scheduling appointments as activities (shown in the deal/contact thread).
alter table activities drop constraint if exists activities_type_check;
alter table activities add constraint activities_type_check
  check (type in ('call', 'note', 'task', 'email', 'appointment'));
