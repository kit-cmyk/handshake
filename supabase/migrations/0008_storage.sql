-- Handshake — storage for email images (rich email editor uploads)

-- Public bucket so image URLs render in delivered emails.
insert into storage.buckets (id, name, public)
values ('email-assets', 'email-assets', true)
on conflict (id) do nothing;

-- Anyone can read (needed for images in sent emails).
drop policy if exists "email_assets_read" on storage.objects;
create policy "email_assets_read" on storage.objects
  for select using (bucket_id = 'email-assets');

-- Authenticated users can upload.
drop policy if exists "email_assets_insert" on storage.objects;
create policy "email_assets_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'email-assets');

-- Authenticated users can remove their uploads.
drop policy if exists "email_assets_delete" on storage.objects;
create policy "email_assets_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'email-assets');
