-- Fix: new auth users must always get a public.profiles row.
-- Root causes seen in production:
-- 1) supabase_auth_admin had no INSERT privilege on profiles
-- 2) handle_new_user_profile needed a hardened SECURITY DEFINER path
-- 3) some auth.users rows were left without matching profiles (orphans)

-- Allow the Auth service role to write profiles (belt-and-suspenders with SECURITY DEFINER).
grant usage on schema public to supabase_auth_admin;
grant select, insert, update on table public.profiles to supabase_auth_admin;

create or replace function public.handle_new_user_profile()
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
  next_role text := lower(nullif(trim(coalesce(meta->>'role', '')), ''));
  next_email text := nullif(trim(coalesce(new.email, meta->>'email', '')), '');
begin
  if next_role is null or next_role not in ('citizen', 'admin', 'moderator', 'departmenthead') then
    next_role := 'citizen';
  end if;

  if next_role = 'departmenthead' then
    next_role := 'moderator';
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    contact_number,
    barangay,
    role
  )
  values (
    new.id,
    coalesce(next_email, new.id::text || '@users.local'),
    coalesce(next_full_name, 'Citizen'),
    coalesce(next_contact, '00000000000'),
    coalesce(next_barangay, 'Unassigned'),
    next_role
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    contact_number = excluded.contact_number,
    barangay = excluded.barangay,
    role = excluded.role;

  return new;
exception
  when others then
    -- Never block auth user creation; log and continue.
    raise warning 'handle_new_user_profile failed for %: %', new.id, sqlerrm;
    begin
      insert into public.profiles (
        id,
        email,
        full_name,
        contact_number,
        barangay,
        role
      )
      values (
        new.id,
        coalesce(new.email, new.id::text || '@users.local'),
        'Citizen',
        '00000000000',
        'Unassigned',
        'citizen'
      )
      on conflict (id) do nothing;
    exception
      when others then
        raise warning 'handle_new_user_profile fallback failed for %: %', new.id, sqlerrm;
    end;
    return new;
end;
$$;

alter function public.handle_new_user_profile() owner to postgres;

revoke all on function public.handle_new_user_profile() from public;
grant execute on function public.handle_new_user_profile() to postgres;
grant execute on function public.handle_new_user_profile() to supabase_auth_admin;
grant execute on function public.handle_new_user_profile() to service_role;
grant execute on function public.handle_new_user_profile() to authenticated;
grant execute on function public.handle_new_user_profile() to anon;

drop trigger if exists on_auth_user_created_create_profile on auth.users;

create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row
execute function public.handle_new_user_profile();

-- Backfill auth users that never got a profiles row.
insert into public.profiles (
  id,
  email,
  full_name,
  contact_number,
  barangay,
  role
)
select
  u.id,
  coalesce(nullif(trim(u.email), ''), u.id::text || '@users.local'),
  coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), 'Citizen'),
  coalesce(nullif(trim(u.raw_user_meta_data->>'contact_number'), ''), '00000000000'),
  coalesce(nullif(trim(u.raw_user_meta_data->>'barangay'), ''), 'Unassigned'),
  case
    when lower(coalesce(u.raw_user_meta_data->>'role', 'citizen')) in ('admin', 'moderator', 'citizen')
      then lower(coalesce(u.raw_user_meta_data->>'role', 'citizen'))
    when lower(coalesce(u.raw_user_meta_data->>'role', '')) = 'departmenthead'
      then 'moderator'
    else 'citizen'
  end
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
