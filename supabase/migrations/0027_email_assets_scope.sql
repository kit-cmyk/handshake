-- Handshake — scope email-assets writes to the uploader's own folder.
--
-- Previously any authenticated user could upload to OR delete any object in the
-- shared `email-assets` bucket, so a user in one org could delete another org's
-- email images. Mirror the avatars bucket: writes/deletes are allowed only
-- within email-assets/<user_id>/... Reads stay public so images render in
-- delivered emails.

drop policy if exists "email_assets_insert" on storage.objects;
create policy "email_assets_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'email-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "email_assets_update" on storage.objects;
create policy "email_assets_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'email-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "email_assets_delete" on storage.objects;
create policy "email_assets_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'email-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
