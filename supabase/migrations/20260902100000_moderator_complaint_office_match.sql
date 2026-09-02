-- Moderator complaint access used exact assigned_office = profiles.department equality.
-- Multi-office routing (e.g. "Office A & Office B") blocked department heads from
-- reading or updating their assigned complaints.

create or replace function public.office_matches_moderator_department(
  p_assigned_office text,
  p_moderator_department text
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  assigned text;
  dept text;
  part text;
begin
  assigned := lower(trim(coalesce(p_assigned_office, '')));
  dept := lower(trim(coalesce(p_moderator_department, '')));

  if dept = '' or assigned = '' then
    return false;
  end if;

  if assigned = dept then
    return true;
  end if;

  if assigned like '%' || dept || '%' then
    return true;
  end if;

  if dept like '%' || assigned || '%' then
    return true;
  end if;

  foreach part in array regexp_split_to_array(replace(p_assigned_office, '&', '|'), '\|')
  loop
    part := lower(trim(part));
    if part = '' then
      continue;
    end if;

    if part = dept or part like '%' || dept || '%' or dept like '%' || part || '%' then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

create or replace function public.complaint_assigned_to_current_moderator(
  p_assigned_office text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_is_moderator()
    and public.office_matches_moderator_department(
      p_assigned_office,
      public.current_user_department()
    );
$$;

drop policy if exists "Moderators can view assigned complaints" on public.complaints;

create policy "Moderators can view assigned complaints"
  on public.complaints
  for select
  to authenticated
  using (public.complaint_assigned_to_current_moderator(assigned_office));

drop policy if exists "Moderators can update assigned complaints" on public.complaints;

create policy "Moderators can update assigned complaints"
  on public.complaints
  for update
  to authenticated
  using (public.complaint_assigned_to_current_moderator(assigned_office))
  with check (public.current_user_is_moderator());
