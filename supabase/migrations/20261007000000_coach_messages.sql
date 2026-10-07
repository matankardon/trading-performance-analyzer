create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists coach_messages_user_conversation_created_idx
  on public.coach_messages (user_id, conversation_id, created_at);

alter table public.coach_messages enable row level security;

drop policy if exists "Users select own coach messages" on public.coach_messages;
create policy "Users select own coach messages"
  on public.coach_messages for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own coach messages" on public.coach_messages;
create policy "Users insert own coach messages"
  on public.coach_messages for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own coach messages" on public.coach_messages;
create policy "Users delete own coach messages"
  on public.coach_messages for delete
  using (auth.uid() = user_id);