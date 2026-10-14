create table if not exists public.marketplace_payments (
  channel text not null check (channel in ('ebay', 'amazon', 'temu')),
  external_id text not null,
  paid_at timestamptz,
  txn_type text,
  status text,
  reference text,
  description text,
  batch_id text,
  product_charges numeric,
  other_amount numeric,
  amount numeric,
  currency text not null default 'GBP',
  synced_at timestamptz not null default now(),
  primary key (channel, external_id)
);

create index if not exists marketplace_payments_paid_at_idx
  on public.marketplace_payments (channel, paid_at desc);

alter table public.marketplace_payments enable row level security;
