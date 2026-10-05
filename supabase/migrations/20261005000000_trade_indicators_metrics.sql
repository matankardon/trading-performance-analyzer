alter table public.trades
  add column if not exists indicators jsonb not null default '[]'::jsonb,
  add column if not exists metrics jsonb not null default '{}'::jsonb;
