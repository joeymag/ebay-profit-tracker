create table if not exists public.ebay_live_listings (
  listing_id text primary key,
  sku text not null,
  title text,
  offer_id text,
  status text not null,
  format text,
  marketplace_id text not null,
  price double precision,
  currency text,
  quantity double precision,
  image_url text,
  item_web_url text,
  promo_rate_percent double precision,
  promo_ad_status text,
  promo_campaign_name text,
  promo_campaign_id text,
  promo_ad_id text,
  unit_cost double precision,
  default_postage double precision,
  transactions_last_30_days double precision,
  synced_at timestamptz not null default now()
);

create index if not exists ebay_live_listings_sku_idx
  on public.ebay_live_listings (sku);

alter table public.ebay_live_listings enable row level security;
