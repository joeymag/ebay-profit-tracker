alter table public.orders
  add column if not exists ebay_ads_fee_actual numeric(12, 2);
