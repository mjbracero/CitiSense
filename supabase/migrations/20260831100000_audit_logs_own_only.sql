-- Audit logs are account-scoped: each user can only view their own rows.
-- Run this in the Supabase SQL Editor, then reload the app.

drop policy if exists "Users can view own or admin all audit logs" on public.audit_logs;
drop policy if exists "Users can view own audit logs" on public.audit_logs;

create policy "Users can view own audit logs"
  on public.audit_logs
  for select
  to authenticated
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
