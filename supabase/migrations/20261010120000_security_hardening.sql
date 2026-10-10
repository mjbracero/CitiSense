-- ===== Security hardening (database "firewall") =====
-- 1. Close over-permissive notification policies
-- 2. Lock down who can call privileged database functions
-- 3. Remove signed-out (anon) access to app tables
-- 4. Stop citizens from changing complaint status / ownership directly
-- 5. Rate-limit complaint submissions (anti-spam / anti-flooding)
-- 6. Storage: only the uploader can overwrite a photo; images only, size limits

-- ---------------------------------------------------------------------------
-- 1. Notification policies
-- ---------------------------------------------------------------------------

-- Any signed-in user could read, edit and create every department head notification.
drop policy if exists "Allow authenticated users to read moderator notifications" on public.moderator_notifications;
drop policy if exists "Allow authenticated users to update moderator notifications" on public.moderator_notifications;
drop policy if exists "Allow authenticated users to insert moderator notifications" on public.moderator_notifications;

-- Citizens can't read staff profiles, so the role check runs as a trusted helper.
create or replace function public.profile_is_department_head(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_profile_id
      and lower(trim(coalesce(p.role, ''))) = 'moderator'
  );
$$;

drop policy if exists "Citizens can notify department heads about own complaints" on public.moderator_notifications;
create policy "Citizens can notify department heads about own complaints"
  on public.moderator_notifications
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.complaints c
      where c.id::text = moderator_notifications.complaint_id
        and c.citizen_id = auth.uid()
    )
    and public.profile_is_department_head(moderator_notifications.moderator_id)
  );

drop policy if exists "Admins can create department head notifications" on public.moderator_notifications;
create policy "Admins can create department head notifications"
  on public.moderator_notifications
  for insert
  to authenticated
  with check (public.current_user_is_admin());

-- Any signed-in user could create fake notifications for any citizen.
drop policy if exists "Allow notification insert for authenticated users" on public.complaint_notifications;

drop policy if exists "Citizens can create notifications for own complaints" on public.complaint_notifications;
create policy "Citizens can create notifications for own complaints"
  on public.complaint_notifications
  for insert
  to authenticated
  with check (
    citizen_id = auth.uid()
    and exists (
      select 1 from public.complaints c
      where c.id = complaint_notifications.complaint_id
        and c.citizen_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Function execute privileges
-- ---------------------------------------------------------------------------

-- Signed-out users never call database functions; signed-in users keep access.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon', fn.signature);
    execute format('grant execute on function %s to authenticated, service_role', fn.signature);
  end loop;
end
$$;

-- Internal helpers only run inside triggers / server code, never from the app.
revoke execute on function public.insert_admin_notification_for_all_admins(uuid, text, text, text, text, text, text, text, jsonb) from authenticated;
revoke execute on function public.insert_admin_notifications_for_all_admins(uuid, text, text, text, text, text, text, text, text, jsonb) from authenticated;
revoke execute on function public.insert_moderator_notifications_for_department(text, uuid, text, text, text, text, text, text, jsonb) from authenticated;
revoke execute on function public.send_citizen_validation_reminders(uuid, interval, interval) from authenticated;
revoke execute on function public.add_office_to_complaint(uuid, text) from authenticated;

-- New functions created later start locked for signed-out users.
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------------
-- 3. Signed-out (anon) table access
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ---------------------------------------------------------------------------
-- 4. Citizen complaint update guard
-- ---------------------------------------------------------------------------

create or replace function public.guard_citizen_complaint_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Staff, server code and service role are not restricted here.
  if auth.uid() is null
    or public.current_user_is_admin()
    or public.current_user_is_moderator()
  then
    return new;
  end if;

  if new.citizen_id is distinct from old.citizen_id then
    raise exception 'You cannot transfer a complaint to another account.'
      using errcode = '42501';
  end if;

  -- Citizens may only (re)submit validation: For Validation / Returned -> For Validation.
  if new.status is distinct from old.status
    and not (new.status = 'For Validation' and old.status in ('For Validation', 'Returned'))
  then
    raise exception 'Only the assigned department or an admin can change the complaint status.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_citizen_complaint_update() from public, anon, authenticated;

drop trigger if exists a00_guard_citizen_complaint_update on public.complaints;
create trigger a00_guard_citizen_complaint_update
  before update on public.complaints
  for each row
  execute function public.guard_citizen_complaint_update();

-- ---------------------------------------------------------------------------
-- 5. Complaint submission rate limit
-- ---------------------------------------------------------------------------

create or replace function public.limit_complaint_submission_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent integer;
begin
  if auth.uid() is null then
    return new;
  end if;

  select count(*) into v_recent
  from public.complaints
  where citizen_id = auth.uid()
    and created_at > now() - interval '1 hour';

  if v_recent >= 10 then
    raise exception 'Too many complaints submitted in the last hour. Please wait before submitting again. For emergencies, call 911.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke execute on function public.limit_complaint_submission_rate() from public, anon, authenticated;

drop trigger if exists a00_limit_complaint_submission_rate on public.complaints;
create trigger a00_limit_complaint_submission_rate
  before insert on public.complaints
  for each row
  execute function public.limit_complaint_submission_rate();

-- ---------------------------------------------------------------------------
-- 6. Storage
-- ---------------------------------------------------------------------------

-- Any signed-in user could overwrite anyone's complaint / validation photos.
drop policy if exists "Allow authenticated complaint photo updates" on storage.objects;
drop policy if exists "Owners can update own complaint photos" on storage.objects;
create policy "Owners can update own complaint photos"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'complaint-photos' and owner_id = (auth.uid())::text)
  with check (bucket_id = 'complaint-photos' and owner_id = (auth.uid())::text);

drop policy if exists "Citizens can update validation photos" on storage.objects;
drop policy if exists "Owners can update own validation photos" on storage.objects;
create policy "Owners can update own validation photos"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'validation-photos' and owner_id = (auth.uid())::text)
  with check (bucket_id = 'validation-photos' and owner_id = (auth.uid())::text);

-- Images only, with size caps (blocks malware / huge uploads).
update storage.buckets
set file_size_limit = 10 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id in ('complaint-photos', 'validation-photos');

update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id = 'avatars';
