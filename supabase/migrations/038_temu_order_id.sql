alter table public.orders
  add column if not exists temu_order_id text;

create index if not exists orders_temu_order_id_idx
  on public.orders (temu_order_id)
  where temu_order_id is not null;
