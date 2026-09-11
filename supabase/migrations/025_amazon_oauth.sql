create table if not exists public.amazon_oauth (
  id text primary key,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.amazon_oauth enable row level security;
