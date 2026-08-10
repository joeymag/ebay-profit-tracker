alter table public.products
  add column if not exists default_postage numeric(12, 2);
