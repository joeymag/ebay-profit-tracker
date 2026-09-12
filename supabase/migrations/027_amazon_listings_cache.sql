create table if not exists public.amazon_listings_cache (
  marketplace_id text primary key,
  listings jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);

alter table public.amazon_listings_cache enable row level security;
