-- Admin can change a user's role and ban/unban from Manage Users.
-- These functions bypass own-profile-only UPDATE RLS.

alter table public.profiles
  add column if not exists banned_at timestamptz;

create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role text,
  p_department text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  next_role text;
  next_department text;
  result public.profiles;
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception 'Only admins can change user roles';
  end if;

  if p_user_id is null then
    raise exception 'User is required';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;

  next_role := lower(trim(coalesce(p_role, '')));

  if next_role = 'departmenthead' then
    next_role := 'moderator';
  end if;

  if next_role not in ('citizen', 'admin', 'moderator') then
    raise exception 'Invalid role';
  end if;

  next_department := nullif(trim(coalesce(p_department, '')), '');

  if next_role = 'moderator' and next_department is null then
    raise exception 'Department is required for department heads';
  end if;

  if next_role = 'citizen' then
    next_department := null;
  end if;

  update public.profiles
  set
    role = next_role,
    department = case
      when next_role = 'moderator' then next_department
      when next_role = 'admin' then coalesce(next_department, department)
      else null
    end
  where id = p_user_id
  returning * into result;

  if result.id is null then
    raise exception 'User profile not found';
  end if;

  begin
    update auth.users
    set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'role', next_role,
        'department', coalesce(result.department, '')
      )
    where id = p_user_id;
  exception
    when others then
      raise warning 'admin_set_user_role auth metadata sync failed for %: %', p_user_id, sqlerrm;
  end;

  return result;
end;
$$;

create or replace function public.admin_set_user_banned(
  p_user_id uuid,
  p_banned boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  result public.profiles;
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception 'Only admins can ban users';
  end if;

  if p_user_id is null then
    raise exception 'User is required';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot ban your own account';
  end if;

  update public.profiles
  set banned_at = case when coalesce(p_banned, false) then now() else null end
  where id = p_user_id
  returning * into result;

  if result.id is null then
    raise exception 'User profile not found';
  end if;

  begin
    update auth.users
    set banned_until = case
      when coalesce(p_banned, false) then timestamptz 'infinity'
      else null
    end
    where id = p_user_id;
  exception
    when others then
      raise warning 'admin_set_user_banned auth ban sync failed for %: %', p_user_id, sqlerrm;
  end;

  return result;
end;
$$;

revoke all on function public.admin_set_user_role(uuid, text, text) from public;
grant execute on function public.admin_set_user_role(uuid, text, text) to authenticated;

revoke all on function public.admin_set_user_banned(uuid, boolean) from public;
grant execute on function public.admin_set_user_banned(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
