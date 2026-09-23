create table if not exists public.strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  description text,
  assets text,
  timeframe text,
  session text,
  direction text,
  status text default 'Draft',
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.strategy_versions (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid references public.strategies(id) on delete cascade not null,
  version_number int not null,
  entry_rules text,
  exit_rules text,
  stop_loss_rules text,
  take_profit_rules text,
  risk_reward text,
  conditions jsonb,
  created_at timestamptz default now()
);

alter table public.trades
  add column if not exists strategy_version_id uuid references public.strategy_versions(id);

alter table public.strategies enable row level security;
alter table public.strategy_versions enable row level security;

 drop policy if exists "Users manage own strategies" on public.strategies;
create policy "Users manage own strategies" on public.strategies
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

 drop policy if exists "Users manage own strategy versions" on public.strategy_versions;
create policy "Users manage own strategy versions" on public.strategy_versions
  for all using (strategy_id in (select id from public.strategies where user_id = auth.uid()))
  with check (strategy_id in (select id from public.strategies where user_id = auth.uid()));
