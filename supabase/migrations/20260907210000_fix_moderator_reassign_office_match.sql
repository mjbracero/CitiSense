-- Reassignment RPC used exact assigned_office = profiles.department equality.
-- Multi-office rows (e.g. "Office A & Office B") and office aliases were visible
-- via RLS office matching, but reassign still rejected them.

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
  assigned := lower(trim(both from regexp_replace(coalesce(p_assigned_office, ''), '''+', '', 'g')));
  dept := lower(trim(both from regexp_replace(coalesce(p_moderator_department, ''), '''+', '', 'g')));
  assigned := regexp_replace(assigned, '\s+', ' ', 'g');
  dept := regexp_replace(dept, '\s+', ' ', 'g');

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

  foreach part in array regexp_split_to_array(
    replace(replace(coalesce(p_assigned_office, ''), '&', '|'), ' and ', '|'),
    '\|'
  )
  loop
    part := lower(trim(both from regexp_replace(part, '''+', '', 'g')));
    part := regexp_replace(part, '\s+', ' ', 'g');

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

create or replace function public.reassign_complaint_by_moderator(
  p_complaint_id uuid,
  p_new_category text,
  p_new_assigned_office text,
  p_reason text
)
returns public.complaints
language plpgsql
security definer
set search_path = public
as $$
declare
  v_complaint public.complaints;
  v_new_category text;
  v_new_office text;
  v_reason text;
begin
  if not public.current_user_is_moderator() then
    raise exception 'Only department heads can reassign complaints.';
  end if;

  v_new_category := nullif(trim(both from coalesce(p_new_category, '')), '');
  v_new_office := nullif(trim(both from coalesce(p_new_assigned_office, '')), '');
  v_reason := nullif(trim(both from coalesce(p_reason, '')), '');

  if v_new_category is null then
    raise exception 'Please choose a new category for this complaint.';
  end if;

  if v_new_office is null then
    raise exception 'Please choose a new assigned office for this complaint.';
  end if;

  if v_reason is null then
    raise exception 'Please provide a reason for reassigning this complaint.';
  end if;

  select *
  into v_complaint
  from public.complaints
  where id = p_complaint_id
  for update;

  if not found then
    raise exception 'Complaint not found.';
  end if;

  if lower(trim(both from coalesce(v_complaint.status, ''))) = 'completed' then
    raise exception 'Completed complaints can no longer be reassigned.';
  end if;

  if not public.complaint_assigned_to_current_moderator(v_complaint.assigned_office) then
    raise exception
      'You cannot reassign a complaint that was not in your assigned complaints.';
  end if;

  update public.complaints
  set
    category = v_new_category,
    assigned_office = v_new_office,
    reassignment_reason = v_reason,
    reassigned_from_category = v_complaint.category,
    reassigned_from_office = v_complaint.assigned_office,
    reassigned_to_category = v_new_category,
    reassigned_to_office = v_new_office,
    reassigned_at = timezone('utc', now())
  where id = p_complaint_id
  returning * into v_complaint;

  return v_complaint;
end;
$$;

revoke all on function public.reassign_complaint_by_moderator(uuid, text, text, text) from public;
grant execute on function public.reassign_complaint_by_moderator(uuid, text, text, text) to authenticated;
