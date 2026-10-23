create table if not exists public.ebay_competitor_listings (
  id uuid primary key default gen_random_uuid(),
  our_listing_id text not null,
  competitor_name text not null,
  competitor_item_id text not null,
  competitor_title text,
  competitor_url text,
  variation_count integer not null default 0,
  prices jsonb not null default '[]'::jsonb,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ebay_competitor_listings_our_item_unique
    unique (our_listing_id, competitor_item_id)
);

create index if not exists ebay_competitor_listings_our_listing_id_idx
  on public.ebay_competitor_listings (our_listing_id);

create index if not exists ebay_competitor_listings_fetched_at_idx
  on public.ebay_competitor_listings (fetched_at desc);

alter table public.ebay_competitor_listings enable row level security;
