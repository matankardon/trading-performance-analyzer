create table if not exists public.coach_conversations (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_conversations_user_updated_idx
  on public.coach_conversations (user_id, updated_at desc);

alter table public.coach_conversations enable row level security;

drop policy if exists "Users select own coach conversations" on public.coach_conversations;
create policy "Users select own coach conversations"
  on public.coach_conversations for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own coach conversations" on public.coach_conversations;
create policy "Users insert own coach conversations"
  on public.coach_conversations for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own coach conversations" on public.coach_conversations;
create policy "Users update own coach conversations"
  on public.coach_conversations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own coach conversations" on public.coach_conversations;
create policy "Users delete own coach conversations"
  on public.coach_conversations for delete
  using (auth.uid() = user_id);

insert into public.coach_conversations (id, user_id, title, created_at, updated_at)
select
  messages.conversation_id,
  messages.user_id,
  coalesce(nullif(left(btrim(first_user.content), 50), ''), 'New chat'),
  messages.created_at,
  messages.updated_at
from (
  select
    conversation_id,
    user_id,
    min(created_at) as created_at,
    max(created_at) as updated_at
  from public.coach_messages
  group by conversation_id, user_id
) as messages
left join lateral (
  select content
  from public.coach_messages as first_message
  where first_message.user_id = messages.user_id
    and first_message.conversation_id = messages.conversation_id
    and first_message.role = 'user'
  order by first_message.created_at asc, first_message.id asc
  limit 1
) as first_user on true
on conflict (id) do nothing;

alter table public.coach_messages
  add constraint coach_messages_conversation_id_fkey
  foreign key (conversation_id)
  references public.coach_conversations (id)
  on delete cascade;
