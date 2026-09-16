-- Store private screenshot metadata for screenshot-created trades.
-- Apply with `supabase db push` after linking the project.

alter table public.trades
  -- These fields support journal display and future AI extraction improvement.
  add column if not exists screenshot_path text,
  add column if not exists ai_extraction jsonb;

insert into storage.buckets (id, name, public)
values ('trade-screenshots', 'trade-screenshots', false)
on conflict (id) do update set public = false;

create policy "Users can upload their own trade screenshots"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'trade-screenshots'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can read their own trade screenshots"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'trade-screenshots'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can update their own trade screenshots"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'trade-screenshots'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'trade-screenshots'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can delete their own trade screenshots"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'trade-screenshots'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
