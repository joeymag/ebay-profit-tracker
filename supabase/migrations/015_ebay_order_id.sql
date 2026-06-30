alter table public.orders
  add column if not exists ebay_order_id text;

create index if not exists orders_ebay_order_id_idx
  on public.orders (ebay_order_id)
  where ebay_order_id is not null;
