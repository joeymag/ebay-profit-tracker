create table if not exists public.amazon_competitive_cache (
  sku text primary key,
  snapshot jsonb not null,
  fetched_at timestamptz not null default now()
);

create index if not exists amazon_competitive_cache_fetched_at_idx
  on public.amazon_competitive_cache (fetched_at desc);

alter table public.amazon_competitive_cache disable row level security;
