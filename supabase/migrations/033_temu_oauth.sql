create table if not exists public.temu_oauth (
  id text primary key,
  app_key text not null,
  app_secret text not null,
  access_token text not null,
  region text not null default 'eu',
  mall_id text,
  updated_at timestamptz not null default now()
);

alter table public.temu_oauth enable row level security;

notify pgrst, 'reload schema';
