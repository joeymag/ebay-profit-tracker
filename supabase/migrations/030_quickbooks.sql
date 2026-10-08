create table if not exists public.quickbooks_oauth (
  id text primary key,
  realm_id text not null,
  refresh_token text not null,
  access_token text,
  access_expires_at timestamptz,
  company_name text,
  updated_at timestamptz not null default now()
);

alter table public.quickbooks_oauth enable row level security;

create table if not exists public.quickbooks_transactions (
  id text primary key,
  realm_id text not null,
  txn_key text not null,
  txn_date date not null,
  txn_type text,
  doc_number text,
  name text,
  memo text,
  account_name text,
  split_account text,
  amount numeric not null,
  synced_at timestamptz not null default now()
);

create index if not exists quickbooks_transactions_date_idx
  on public.quickbooks_transactions (txn_date desc);

alter table public.quickbooks_transactions enable row level security;
