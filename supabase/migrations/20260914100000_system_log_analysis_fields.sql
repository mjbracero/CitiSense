-- System Log Analysis support:
-- Persist AI routing snapshot + complaint lifecycle timestamps so Admin Analytics
-- can measure AI accuracy, processing time, and resolution performance.

alter table public.complaints
  add column if not exists ai_category text,
  add column if not exists ai_assigned_office text,
  add column if not exists ai_confidence double precision,
  add column if not exists ai_analyzed_at timestamptz,
  add column if not exists routed_at timestamptz,
  add column if not exists in_progress_at timestamptz,
  add column if not exists for_validation_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists returned_at timestamptz;

comment on column public.complaints.ai_category is
  'Category predicted by AI at submission time (system log analysis baseline).';
comment on column public.complaints.ai_assigned_office is
  'Office predicted/routed by AI at submission time.';
comment on column public.complaints.ai_confidence is
  'AI confidence score (0-1) at submission time.';
comment on column public.complaints.routed_at is
  'When the complaint was first assigned/routed to an office.';
comment on column public.complaints.in_progress_at is
  'When the complaint first entered In Progress.';
comment on column public.complaints.for_validation_at is
  'When the complaint first entered For Validation.';
comment on column public.complaints.completed_at is
  'When the complaint was marked Completed.';
comment on column public.complaints.returned_at is
  'When the complaint was last returned for more work.';

-- Stamp lifecycle timestamps automatically on status/office changes.
create or replace function public.stamp_complaint_lifecycle_timestamps()
returns trigger
language plpgsql
as $$
declare
  old_status text := lower(trim(both from coalesce(OLD.status, '')));
  new_status text := lower(trim(both from coalesce(NEW.status, '')));
  old_office text := nullif(trim(both from coalesce(OLD.assigned_office, '')), '');
  new_office text := nullif(trim(both from coalesce(NEW.assigned_office, '')), '');
begin
  if TG_OP = 'INSERT' then
    if new_office is not null and lower(new_office) <> 'unassigned' then
      NEW.routed_at := coalesce(NEW.routed_at, now());
    end if;

    if NEW.ai_analyzed_at is null
       and (
         NEW.ai_category is not null
         or NEW.ai_assigned_office is not null
         or NEW.ai_confidence is not null
       ) then
      NEW.ai_analyzed_at := now();
    end if;

    return NEW;
  end if;

  if old_office is null
     and new_office is not null
     and lower(new_office) <> 'unassigned'
     and NEW.routed_at is null then
    NEW.routed_at := now();
  end if;

  if new_status is distinct from old_status then
    if new_status in ('in progress', 'in_progress', 'ongoing', 'processing')
       and NEW.in_progress_at is null then
      NEW.in_progress_at := now();
    end if;

    if new_status in ('for validation', 'for_validation', 'validated')
       and NEW.for_validation_at is null then
      NEW.for_validation_at := now();
    end if;

    if new_status in ('completed', 'complete', 'resolved', 'closed')
       and NEW.completed_at is null then
      NEW.completed_at := now();
    end if;

    if new_status in ('returned', 'unsolved') then
      NEW.returned_at := now();
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_stamp_complaint_lifecycle_timestamps on public.complaints;
create trigger trg_stamp_complaint_lifecycle_timestamps
before insert or update of status, assigned_office, ai_category, ai_assigned_office, ai_confidence
on public.complaints
for each row
execute function public.stamp_complaint_lifecycle_timestamps();

-- Best-effort backfill for existing rows.
update public.complaints
set
  ai_category = coalesce(ai_category, nullif(trim(category), '')),
  ai_assigned_office = coalesce(
    ai_assigned_office,
    nullif(trim(assigned_office), '')
  ),
  routed_at = coalesce(
    routed_at,
    case
      when nullif(trim(assigned_office), '') is not null
           and lower(trim(assigned_office)) <> 'unassigned'
        then created_at
      else null
    end
  ),
  in_progress_at = coalesce(
    in_progress_at,
    case
      when lower(trim(coalesce(status, ''))) in (
        'in progress', 'for validation', 'validated', 'completed', 'returned'
      ) then created_at
      else null
    end
  ),
  for_validation_at = coalesce(
    for_validation_at,
    case
      when lower(trim(coalesce(status, ''))) in (
        'for validation', 'validated', 'completed'
      ) then coalesce(citizen_validated_at, created_at)
      else null
    end
  ),
  completed_at = coalesce(
    completed_at,
    case
      when lower(trim(coalesce(status, ''))) in ('completed', 'resolved', 'closed')
        then coalesce(citizen_validated_at, created_at)
      else null
    end
  )
where true;

notify pgrst, 'reload schema';
