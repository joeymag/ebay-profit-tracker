-- Cross-invocation locks so buybox-check handoff and amazon-reprice cron
-- cannot PATCH the same Standard SKU at the same time.
create table if not exists public.amazon_reprice_sku_locks (
  sku text primary key,
  holder text not null,
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists amazon_reprice_sku_locks_expires_at_idx
  on public.amazon_reprice_sku_locks (expires_at);

alter table public.amazon_reprice_sku_locks enable row level security;
