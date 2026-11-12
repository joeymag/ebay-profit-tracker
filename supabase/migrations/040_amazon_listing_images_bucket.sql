-- Public bucket for Amazon listing image uploads (Listings Items needs a fetchable URL).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'amazon-listing-images',
  'amazon-listing-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read amazon listing images" on storage.objects;
create policy "Public read amazon listing images"
  on storage.objects
  for select
  to public
  using (bucket_id = 'amazon-listing-images');

drop policy if exists "Authenticated upload amazon listing images" on storage.objects;
create policy "Authenticated upload amazon listing images"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'amazon-listing-images');

drop policy if exists "Authenticated update amazon listing images" on storage.objects;
create policy "Authenticated update amazon listing images"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'amazon-listing-images')
  with check (bucket_id = 'amazon-listing-images');
