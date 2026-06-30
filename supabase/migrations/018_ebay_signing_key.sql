alter table public.ebay_oauth
  add column if not exists signing_private_key text,
  add column if not exists signing_jwe text,
  add column if not exists signing_key_id text;
