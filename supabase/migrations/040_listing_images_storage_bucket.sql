-- Public bucket for Amazon/eBay listing image uploads (shared helper).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-images',
  'listing-images',
  true,
  10485760,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read listing images" on storage.objects;
create policy "Public read listing images"
  on storage.objects
  for select
  to public
  using (bucket_id = 'listing-images');

drop policy if exists "Service insert listing images" on storage.objects;
create policy "Service insert listing images"
  on storage.objects
  for insert
  to authenticated, service_role
  with check (bucket_id = 'listing-images');

drop policy if exists "Service update listing images" on storage.objects;
create policy "Service update listing images"
  on storage.objects
  for update
  to authenticated, service_role
  using (bucket_id = 'listing-images')
  with check (bucket_id = 'listing-images');
