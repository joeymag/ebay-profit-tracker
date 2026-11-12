-- Per-SKU Amazon listing cache for the grid + editor (live SP-API stays for refresh/save).
create table if not exists public.amazon_listings (
  sku text primary key,
  marketplace_id text not null,
  asin text,
  listing_id text,
  parent_sku text,
  parentage text not null default 'standalone'
    check (parentage in ('parent', 'child', 'standalone')),
  child_skus text[] not null default '{}'::text[],
  product_type text,
  title text,
  description text,
  bullet_points text[] not null default '{}'::text[],
  generic_keywords text,
  image_urls text[] not null default '{}'::text[],
  price double precision,
  quantity double precision,
  fulfillment_channel text,
  condition text,
  status text,
  product_url text,
  raw_attributes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);

create index if not exists amazon_listings_marketplace_id_idx
  on public.amazon_listings (marketplace_id);

create index if not exists amazon_listings_parent_sku_idx
  on public.amazon_listings (parent_sku);

create index if not exists amazon_listings_synced_at_idx
  on public.amazon_listings (synced_at desc);

alter table public.amazon_listings enable row level security;

-- Server-side cache: prefer SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
-- Authenticated + anon policies cover dashboard reads and local sync when
-- only the publishable key is configured.
drop policy if exists "Authenticated can read amazon listings" on public.amazon_listings;
create policy "Authenticated can read amazon listings"
  on public.amazon_listings
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated can insert amazon listings" on public.amazon_listings;
create policy "Authenticated can insert amazon listings"
  on public.amazon_listings
  for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated can update amazon listings" on public.amazon_listings;
create policy "Authenticated can update amazon listings"
  on public.amazon_listings
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated can delete amazon listings" on public.amazon_listings;
create policy "Authenticated can delete amazon listings"
  on public.amazon_listings
  for delete
  to authenticated
  using (true);

drop policy if exists "Anon can manage amazon listings cache" on public.amazon_listings;
create policy "Anon can manage amazon listings cache"
  on public.amazon_listings
  for all
  to anon
  using (true)
  with check (true);
