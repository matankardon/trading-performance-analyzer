create table if not exists public.backtest_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  strategy_version_id uuid references public.strategy_versions(id) on delete cascade not null,
  asset text not null,
  timeframe text,
  session text,
  start_date date,
  end_date date,
  config jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  trades jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);

create index if not exists backtest_results_user_strategy_time_idx
  on public.backtest_results (user_id, strategy_version_id, created_at desc);

alter table public.backtest_results enable row level security;

drop policy if exists "Users manage own backtest results" on public.backtest_results;
create policy "Users manage own backtest results" on public.backtest_results
  for all using (
    strategy_version_id in (
      select sv.id
      from public.strategy_versions sv
      join public.strategies s on s.id = sv.strategy_id
      where s.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and strategy_version_id in (
      select sv.id
      from public.strategy_versions sv
      join public.strategies s on s.id = sv.strategy_id
      where s.user_id = auth.uid()
    )
  );
