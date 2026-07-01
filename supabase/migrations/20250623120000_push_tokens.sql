-- Align push_tokens schema with the live CitiSense database.
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  is_active boolean not null default true,
  device_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists push_tokens_user_id_idx on public.push_tokens (user_id);
create index if not exists push_tokens_active_idx on public.push_tokens (user_id, is_active);

alter table public.push_tokens enable row level security;

drop policy if exists "Users can read own push tokens" on public.push_tokens;
drop policy if exists "Users can insert own push tokens" on public.push_tokens;
drop policy if exists "Users can update own push tokens" on public.push_tokens;
drop policy if exists "Users can delete own push tokens" on public.push_tokens;

create policy "Users can read own push tokens"
  on public.push_tokens
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own push tokens"
  on public.push_tokens
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own push tokens"
  on public.push_tokens
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own push tokens"
  on public.push_tokens
  for delete
  to authenticated
  using (auth.uid() = user_id);
