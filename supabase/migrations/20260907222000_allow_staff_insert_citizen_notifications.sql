-- Admins / department heads must be able to insert citizen notifications
-- when completing, returning, or updating complaint status.
-- RLS previously allowed only the citizen (own rows), so admin complete/return failed.

create or replace function public.current_user_can_notify_citizens()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(trim(coalesce(p.role, ''))) in (
        'admin',
        'moderator',
        'departmenthead'
      )
  );
$$;

drop policy if exists "Admins and moderators can insert citizen notifications"
  on public.complaint_notifications;

create policy "Admins and moderators can insert citizen notifications"
  on public.complaint_notifications
  for insert
  to authenticated
  with check (public.current_user_can_notify_citizens());

drop policy if exists "Admins can read citizen notifications"
  on public.complaint_notifications;

create policy "Admins can read citizen notifications"
  on public.complaint_notifications
  for select
  to authenticated
  using (
    public.current_user_is_admin()
    or citizen_id = auth.uid()
  );
