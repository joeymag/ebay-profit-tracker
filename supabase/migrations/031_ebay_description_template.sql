create table if not exists public.ebay_description_template (
  id text primary key,
  html text not null,
  updated_at timestamptz not null default now()
);

alter table public.ebay_description_template enable row level security;
