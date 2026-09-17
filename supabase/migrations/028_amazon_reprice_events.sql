create table if not exists public.amazon_reprice_events (
  id bigserial primary key,
  sku text not null,
  from_price numeric(12, 2),
  to_price numeric(12, 2) not null,
  source text not null default 'manual',
  reason text,
  status text not null default 'applied',
  created_at timestamptz not null default now()
);

create index if not exists amazon_reprice_events_created_at_idx
  on public.amazon_reprice_events (created_at desc);

create index if not exists amazon_reprice_events_sku_created_at_idx
  on public.amazon_reprice_events (sku, created_at desc);

-- Server-side log; app writes with service role or publishable when service role unset.
alter table public.amazon_reprice_events disable row level security;
