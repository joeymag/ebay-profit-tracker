create table if not exists public.amazon_listings_cache (
  marketplace_id text primary key,
  listings jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);

-- Server-side cache only; no end-user policies. Service role preferred,
-- but publishable key may be used when SUPABASE_SERVICE_ROLE_KEY is unset.
alter table public.amazon_listings_cache disable row level security;
