alter table public.orders
  add column if not exists ebay_fees_actual numeric(12, 2),
  add column if not exists ebay_fees_synced_at timestamptz;

create index if not exists orders_ebay_fees_synced_at_idx
  on public.orders (ebay_fees_synced_at desc)
  where ebay_fees_actual is not null;
