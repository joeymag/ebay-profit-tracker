-- Durable Buy Box watch snapshot for cron (survives Vercel read-only filesystem).
create table if not exists public.amazon_buybox_watch_latest (
  id text primary key default 'latest',
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.amazon_buybox_watch_latest enable row level security;
