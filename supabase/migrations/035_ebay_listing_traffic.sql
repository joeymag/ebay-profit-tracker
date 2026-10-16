create table if not exists public.ebay_listing_traffic_days (
  listing_id text not null,
  metric_date date not null,
  marketplace_id text not null,
  title text,
  search_impressions double precision,
  total_impressions double precision,
  all_impressions double precision,
  views double precision,
  click_through_rate double precision,
  transactions double precision,
  sales_conversion_rate double precision,
  fetched_at timestamptz not null default now(),
  primary key (listing_id, metric_date)
);

create index if not exists ebay_listing_traffic_days_date_idx
  on public.ebay_listing_traffic_days (metric_date desc);

create table if not exists public.ebay_listing_traffic_sync (
  metric_date date primary key,
  listing_count integer not null,
  fetched_at timestamptz not null default now()
);

alter table public.ebay_listing_traffic_days enable row level security;
alter table public.ebay_listing_traffic_sync enable row level security;
