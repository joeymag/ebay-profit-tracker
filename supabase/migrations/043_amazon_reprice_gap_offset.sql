-- Standard mid-gap Buy Box pricing: optional offset from the midpoint.
-- Fixed £ amount and/or fraction of the (buyBox - current) gap. Default 0 = true midpoint.

alter table public.amazon_reprice_rules
  add column if not exists gap_offset_amount numeric(12, 4) not null default 0;

alter table public.amazon_reprice_rules
  add column if not exists gap_offset_percent numeric(8, 4) not null default 0;
