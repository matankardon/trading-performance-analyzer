-- Add nullable canonical trade fields without changing existing records.
alter table public.trades
  add column if not exists position_size numeric,
  add column if not exists risk_reward numeric,
  add column if not exists trade_time text,
  add column if not exists timeframe text;
