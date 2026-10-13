alter table public.coach_request_limits
  add column if not exists bucket text not null default 'coach-chat';

alter table public.coach_request_limits
  drop constraint if exists coach_request_limits_pkey;

alter table public.coach_request_limits
  drop constraint if exists coach_request_limits_request_count_check;

alter table public.coach_request_limits
  add constraint coach_request_limits_request_count_check check (request_count >= 1);

alter table public.coach_request_limits
  add constraint coach_request_limits_pkey primary key (user_id, bucket, window_start);

create or replace function public.consume_rate_limit(p_user_id uuid, p_bucket text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_window timestamptz := date_trunc('hour', now() at time zone 'utc') at time zone 'utc';
  inserted_count integer;
begin
  if p_user_id is null or p_bucket is null or length(p_bucket) = 0
    or length(p_bucket) > 120 or p_limit is null or p_limit < 1 or p_limit > 10000 then
    return false;
  end if;

  delete from public.coach_request_limits
  where window_start < current_window - interval '24 hours';

  insert into public.coach_request_limits (user_id, bucket, window_start, request_count)
  values (p_user_id, p_bucket, current_window, 1)
  on conflict (user_id, bucket, window_start) do update
    set request_count = public.coach_request_limits.request_count + 1
    where public.coach_request_limits.request_count < p_limit
  returning request_count into inserted_count;

  return found;
end;
$$;

create or replace function public.consume_coach_request(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select public.consume_rate_limit(p_user_id, 'coach-chat', 30);
$$;

revoke all on function public.consume_rate_limit(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(uuid, text, integer) to service_role;
revoke all on function public.consume_coach_request(uuid) from public, anon, authenticated;
grant execute on function public.consume_coach_request(uuid) to service_role;

create table public.news_items (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_item_id text not null,
  url text not null,
  url_hash text not null unique,
  title text not null,
  summary text,
  publisher text not null,
  published_at timestamptz not null,
  tickers text[] not null default '{}',
  category text not null check (category in ('markets', 'forex', 'crypto', 'equities', 'macro', 'other')),
  fetched_at timestamptz not null default now(),
  unique (provider, provider_item_id)
);

create index news_items_published_at_idx on public.news_items (published_at desc);
create index news_items_category_published_idx on public.news_items (category, published_at desc);
create index news_items_tickers_idx on public.news_items using gin (tickers);
alter table public.news_items enable row level security;
revoke all on public.news_items from public, anon, authenticated;
grant select on public.news_items to authenticated;
grant select, insert, update, delete on public.news_items to service_role;
create policy "Authenticated users can read news items"
  on public.news_items for select to authenticated using (true);

create table public.news_explanations (
  news_id uuid primary key references public.news_items (id) on delete cascade,
  content jsonb not null,
  model text not null,
  created_at timestamptz not null default now()
);

alter table public.news_explanations enable row level security;
revoke all on public.news_explanations from public, anon, authenticated;
grant select on public.news_explanations to authenticated;
grant select, insert, update, delete on public.news_explanations to service_role;
create policy "Authenticated users can read news explanations"
  on public.news_explanations for select to authenticated using (true);

create table public.news_refresh_state (
  id integer primary key check (id = 1),
  refreshed_at timestamptz,
  category_refreshed_at jsonb not null default '{}'::jsonb,
  lock_until timestamptz,
  last_error text,
  explanation_day date,
  explanation_count integer not null default 0 check (explanation_count >= 0),
  updated_at timestamptz not null default now()
);

insert into public.news_refresh_state (id) values (1);
alter table public.news_refresh_state enable row level security;
revoke all on public.news_refresh_state from public, anon, authenticated;
revoke all on public.news_refresh_state from service_role;
grant select, insert, update, delete on public.news_refresh_state to service_role;

create or replace function public.try_lock_news_refresh(p_lock_seconds integer default 90)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_lock_seconds is null or p_lock_seconds < 1 or p_lock_seconds > 600 then
    return false;
  end if;

  update public.news_refresh_state
  set lock_until = now() + make_interval(secs => p_lock_seconds),
      updated_at = now()
  where id = 1 and (lock_until is null or lock_until < now());

  return found;
end;
$$;

create or replace function public.consume_news_explanation_daily(p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  utc_day date := (now() at time zone 'utc')::date;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100000 then
    return false;
  end if;

  update public.news_refresh_state
  set explanation_count = case
        when explanation_day = utc_day then explanation_count + 1
        else 1
      end,
      explanation_day = utc_day,
      updated_at = now()
  where id = 1
    and (explanation_day is distinct from utc_day or explanation_count < p_limit);

  return found;
end;
$$;

revoke all on function public.try_lock_news_refresh(integer) from public, anon, authenticated;
grant execute on function public.try_lock_news_refresh(integer) to service_role;
revoke all on function public.consume_news_explanation_daily(integer) from public, anon, authenticated;
grant execute on function public.consume_news_explanation_daily(integer) to service_role;
