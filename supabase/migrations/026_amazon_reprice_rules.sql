alter table public.amazon_oauth
  add column if not exists seller_id text;

create table if not exists public.amazon_reprice_rules (
  sku text primary key,
  enabled boolean not null default true,
  strategy text not null default 'undercut_buybox',
  min_price numeric(12, 2),
  max_price numeric(12, 2),
  undercut_amount numeric(12, 2) not null default 0.01,
  updated_at timestamptz not null default now()
);

alter table public.amazon_reprice_rules enable row level security;
