-- Ensure profile edits always land in public.profiles (Manage Users source of truth).
-- Also backfill full_name/contact/etc from auth metadata for users who already edited.

alter table public.profiles
  add column if not exists updated_at timestamptz default now();

create or replace function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  next_full_name text := nullif(trim(coalesce(meta->>'full_name', '')), '');
  next_contact text := nullif(trim(coalesce(meta->>'contact_number', '')), '');
  next_barangay text := nullif(trim(coalesce(meta->>'barangay', '')), '');
  next_department text := nullif(
    trim(
      coalesce(
        meta->>'department',
        meta->>'office',
        meta->>'assigned_office',
        ''
      )
    ),
    ''
  );
  next_avatar text := nullif(trim(coalesce(meta->>'avatar_url', '')), '');
  next_email text := nullif(trim(coalesce(new.email, '')), '');
begin
  update public.profiles
  set
    email = coalesce(next_email, email),
    full_name = coalesce(next_full_name, full_name),
    contact_number = coalesce(next_contact, contact_number),
    barangay = coalesce(next_barangay, barangay),
    department = coalesce(next_department, department),
    avatar_url = coalesce(next_avatar, avatar_url),
    updated_at = now()
  where id = new.id;

  return new;
exception
  when others then
    raise warning 'sync_profile_from_auth_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

alter function public.sync_profile_from_auth_user() owner to postgres;

revoke all on function public.sync_profile_from_auth_user() from public;
grant execute on function public.sync_profile_from_auth_user() to postgres;
grant execute on function public.sync_profile_from_auth_user() to supabase_auth_admin;
grant execute on function public.sync_profile_from_auth_user() to service_role;

drop trigger if exists on_auth_user_updated_sync_profile on auth.users;

create trigger on_auth_user_updated_sync_profile
after update of email, raw_user_meta_data on auth.users
for each row
execute function public.sync_profile_from_auth_user();

-- Client-callable own-profile update (bypasses RLS; never changes role/banned_at).
create or replace function public.update_own_profile(
  p_full_name text default null,
  p_email text default null,
  p_contact_number text default null,
  p_barangay text default null,
  p_department text default null,
  p_avatar_url text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  uid uuid := auth.uid();
  result public.profiles;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
  set
    full_name = coalesce(nullif(trim(coalesce(p_full_name, '')), ''), full_name),
    email = coalesce(nullif(trim(coalesce(p_email, '')), ''), email),
    contact_number = case
      when p_contact_number is null then contact_number
      else nullif(trim(p_contact_number), '')
    end,
    barangay = case
      when p_barangay is null then barangay
      else nullif(trim(p_barangay), '')
    end,
    department = case
      when p_department is null then department
      else nullif(trim(p_department), '')
    end,
    avatar_url = case
      when p_avatar_url is null then avatar_url
      else nullif(trim(p_avatar_url), '')
    end,
    updated_at = now()
  where id = uid
  returning * into result;

  if result.id is null then
    raise exception 'Profile not found';
  end if;

  return result;
end;
$$;

revoke all on function public.update_own_profile(text, text, text, text, text, text) from public;
grant execute on function public.update_own_profile(text, text, text, text, text, text) to authenticated;

-- One-time backfill: copy already-edited auth metadata into profiles.
update public.profiles p
set
  email = coalesce(nullif(trim(u.email), ''), p.email),
  full_name = coalesce(
    nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', '')), ''),
    p.full_name
  ),
  contact_number = coalesce(
    nullif(trim(coalesce(u.raw_user_meta_data->>'contact_number', '')), ''),
    p.contact_number
  ),
  barangay = coalesce(
    nullif(trim(coalesce(u.raw_user_meta_data->>'barangay', '')), ''),
    p.barangay
  ),
  department = coalesce(
    nullif(
      trim(
        coalesce(
          u.raw_user_meta_data->>'department',
          u.raw_user_meta_data->>'office',
          u.raw_user_meta_data->>'assigned_office',
          ''
        )
      ),
      ''
    ),
    p.department
  ),
  avatar_url = coalesce(
    nullif(trim(coalesce(u.raw_user_meta_data->>'avatar_url', '')), ''),
    p.avatar_url
  ),
  updated_at = now()
from auth.users u
where u.id = p.id;

notify pgrst, 'reload schema';
