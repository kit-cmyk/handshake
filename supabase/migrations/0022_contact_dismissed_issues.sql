-- Handshake — let users dismiss data-quality issues they can't (or won't) fix.
-- Stores the FormattingIssueType keys the user has chosen to skip for a
-- contact (e.g. 'missing_phone'). The detector filters these out so a
-- legitimately-blank field stops being flagged forever.

alter table contacts
  add column if not exists dismissed_issues text[] not null default '{}';
