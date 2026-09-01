-- Account and system activity records shown from Profile → Audit Logs.
-- Run this in the Supabase SQL Editor, then reload the app.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  actor_role text,
  actor_name text,
  action text not null,
  title text not null,
  description text,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_user_id_created_at_idx
  on public.audit_logs (user_id, created_at desc);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;

grant usage on schema public to authenticated, anon, service_role;
grant select, insert on table public.audit_logs to authenticated;
grant all on table public.audit_logs to service_role;

drop policy if exists "Users can insert own audit logs" on public.audit_logs;
create policy "Users can insert own audit logs"
  on public.audit_logs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can view own or admin all audit logs" on public.audit_logs;
create policy "Users can view own or admin all audit logs"
  on public.audit_logs
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );

notify pgrst, 'reload schema';
