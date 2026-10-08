create table if not exists public.coach_request_limits (
  user_id uuid not null references auth.users on delete cascade,
  window_start timestamptz not null,
  request_count integer not null check (request_count between 1 and 30),
  primary key (user_id, window_start)
);

alter table public.coach_request_limits enable row level security;

revoke all on public.coach_request_limits from public, anon, authenticated;
grant select, insert, update, delete on public.coach_request_limits to service_role;

create or replace function public.consume_coach_request(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_window timestamptz := date_trunc('hour', now() at time zone 'utc') at time zone 'utc';
  inserted_count integer;
begin
  delete from public.coach_request_limits
  where window_start < current_window - interval '24 hours';

  insert into public.coach_request_limits (user_id, window_start, request_count)
  values (p_user_id, current_window, 1)
  on conflict (user_id, window_start) do update
    set request_count = public.coach_request_limits.request_count + 1
    where public.coach_request_limits.request_count < 30
  returning request_count into inserted_count;

  return found;
end;
$$;

revoke all on function public.consume_coach_request(uuid) from public, anon, authenticated;
grant execute on function public.consume_coach_request(uuid) to service_role;
