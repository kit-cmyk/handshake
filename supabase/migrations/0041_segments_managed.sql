-- App-managed segments.
--
-- A campaign whose audience is a hand-picked contact list ('contacts') or a
-- CSV import ('import') stores that list in an auto-created static segment, so
-- enrollment, eligibility and funnel reporting stay identical across all three
-- audience modes. Those segments were indistinguishable from user-built ones:
-- they showed up on /segments, could be renamed, re-filtered or deleted (the
-- FK is `on delete set null`, so deleting one silently blanked a live
-- campaign's audience), and were offered in every other segment picker.
--
-- `managed` marks them. The app hides managed segments from the segments UI
-- and from every picker, and refuses to edit or delete them directly.

alter table segments
  add column if not exists managed boolean not null default false;

-- Backfill: any segment that already backs a list-style campaign audience.
update segments s
   set managed = true
  from campaigns c
 where c.segment_id = s.id
   and c.audience_mode in ('contacts', 'import')
   and s.managed = false;

-- The list page and every picker filter on (org_id, managed).
drop index if exists segments_org_idx;
create index if not exists segments_org_idx
  on segments(org_id, managed, created_at desc);
