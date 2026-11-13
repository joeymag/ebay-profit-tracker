-- Dual Standard + Business Amazon repricers: channel on rules/events/cache.

-- Rules: add channel + quantity_discount_plan, composite PK (sku, channel)
alter table public.amazon_reprice_rules
  add column if not exists channel text not null default 'standard';

alter table public.amazon_reprice_rules
  add column if not exists quantity_discount_plan jsonb;

update public.amazon_reprice_rules
set channel = 'standard'
where channel is null or channel = '';

alter table public.amazon_reprice_rules
  drop constraint if exists amazon_reprice_rules_channel_check;

alter table public.amazon_reprice_rules
  add constraint amazon_reprice_rules_channel_check
  check (channel in ('standard', 'business'));

alter table public.amazon_reprice_rules drop constraint if exists amazon_reprice_rules_pkey;

alter table public.amazon_reprice_rules
  add primary key (sku, channel);

-- Events: channel column + index
alter table public.amazon_reprice_events
  add column if not exists channel text not null default 'standard';

update public.amazon_reprice_events
set channel = 'standard'
where channel is null or channel = '';

alter table public.amazon_reprice_events
  drop constraint if exists amazon_reprice_events_channel_check;

alter table public.amazon_reprice_events
  add constraint amazon_reprice_events_channel_check
  check (channel in ('standard', 'business'));

create index if not exists amazon_reprice_events_sku_channel_created_at_idx
  on public.amazon_reprice_events (sku, channel, created_at desc);

-- Competitive cache: composite PK (sku, channel)
alter table public.amazon_competitive_cache
  add column if not exists channel text not null default 'standard';

update public.amazon_competitive_cache
set channel = 'standard'
where channel is null or channel = '';

alter table public.amazon_competitive_cache
  drop constraint if exists amazon_competitive_cache_channel_check;

alter table public.amazon_competitive_cache
  add constraint amazon_competitive_cache_channel_check
  check (channel in ('standard', 'business'));

alter table public.amazon_competitive_cache drop constraint if exists amazon_competitive_cache_pkey;

alter table public.amazon_competitive_cache
  add primary key (sku, channel);
