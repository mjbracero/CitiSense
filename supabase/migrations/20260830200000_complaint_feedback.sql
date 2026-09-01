-- Citizen validation feedback history.
-- status: submitted | returned | superseded
-- When a complaint is Returned, the latest submitted row is marked returned
-- so the citizen can submit a new feedback row.
-- Run this in the Supabase SQL Editor, then reload the app.

create table if not exists public.complaint_feedback (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  citizen_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'submitted'
    check (status in ('submitted', 'returned', 'superseded')),
  answer text,
  feedback text,
  photo_urls jsonb not null default '[]'::jsonb,
  ai_validation_status text,
  ai_validation_approved boolean,
  ai_validation_summary text,
  ai_validation_reason text,
  ai_validation_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists complaint_feedback_complaint_id_created_at_idx
  on public.complaint_feedback (complaint_id, created_at desc);

create index if not exists complaint_feedback_complaint_id_status_idx
  on public.complaint_feedback (complaint_id, status);

create index if not exists complaint_feedback_citizen_id_created_at_idx
  on public.complaint_feedback (citizen_id, created_at desc);

comment on table public.complaint_feedback is
  'Citizen validation feedback submissions. A complaint can have multiple rows; returned status allows a new submission.';

comment on column public.complaint_feedback.status is
  'submitted = latest citizen response; returned = admin sent it back so citizen can resubmit; superseded = replaced by a newer submission.';

alter table public.complaint_feedback enable row level security;

grant usage on schema public to authenticated, anon, service_role;
grant select, insert, update on table public.complaint_feedback to authenticated;
grant all on table public.complaint_feedback to service_role;

drop policy if exists "Citizens can view own complaint feedback" on public.complaint_feedback;
create policy "Citizens can view own complaint feedback"
  on public.complaint_feedback
  for select
  to authenticated
  using (
    auth.uid() = citizen_id
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'moderator')
    )
  );

drop policy if exists "Citizens can insert own complaint feedback" on public.complaint_feedback;
create policy "Citizens can insert own complaint feedback"
  on public.complaint_feedback
  for insert
  to authenticated
  with check (
    auth.uid() = citizen_id
    and exists (
      select 1
      from public.complaints c
      where c.id = complaint_id
        and c.citizen_id = auth.uid()
        and c.status in ('For Validation', 'Returned')
    )
  );

drop policy if exists "Citizens can update own complaint feedback" on public.complaint_feedback;
create policy "Citizens can update own complaint feedback"
  on public.complaint_feedback
  for update
  to authenticated
  using (auth.uid() = citizen_id)
  with check (auth.uid() = citizen_id);

drop policy if exists "Staff can update complaint feedback status" on public.complaint_feedback;
create policy "Staff can update complaint feedback status"
  on public.complaint_feedback
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'moderator')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'moderator')
    )
  );

-- Reopen Returned complaints when the citizen submits a new feedback row.
-- Security definer so this still works if citizens cannot update complaints.status.
create or replace function public.sync_complaint_on_feedback_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status <> 'submitted' then
    return NEW;
  end if;

  update public.complaints
  set
    status = 'For Validation',
    validation_status = 'Validated',
    citizen_validation_status = 'Validated',
    citizen_validation_answer = NEW.answer,
    citizen_validation_feedback = NEW.feedback,
    citizen_validation_photo_urls = NEW.photo_urls,
    citizen_validated_at = coalesce(NEW.created_at, now()),
    ai_validation_status = 'pending',
    ai_validation_approved = null,
    ai_validation_summary = 'AI is reviewing the validation evidence.',
    ai_validation_reason = null,
    ai_validation_recommendation = null,
    ai_validated_at = null
  where id = NEW.complaint_id
    and status in ('For Validation', 'Returned');

  return NEW;
end;
$$;

drop trigger if exists complaint_feedback_sync_complaint on public.complaint_feedback;
create trigger complaint_feedback_sync_complaint
after insert on public.complaint_feedback
for each row
execute function public.sync_complaint_on_feedback_insert();

-- Notify admins again when the citizen resubmits after a return
-- (citizen_validated_at is already set from the first submission).
create or replace function public.notify_admins_on_citizen_validation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_record record;
  citizen_display_name text;
  short_id_text text;
  validation_resolved boolean;
  notification_message text;
begin
  if NEW.citizen_validated_at is null then
    return NEW;
  end if;

  if TG_OP = 'UPDATE'
     and NEW.citizen_validated_at is not distinct from OLD.citizen_validated_at then
    return NEW;
  end if;

  if exists (
    select 1
    from public.admin_notifications
    where complaint_id = NEW.id
      and type = 'citizen_validation'
      and created_at > now() - interval '1 minute'
  ) then
    return NEW;
  end if;

  select coalesce(nullif(trim(full_name), ''), nullif(trim(email), ''), 'Citizen')
  into citizen_display_name
  from public.profiles
  where id = NEW.citizen_id;

  short_id_text := coalesce(
    nullif(trim(NEW.short_id), ''),
    left(NEW.id::text, 8)
  );

  validation_resolved := lower(coalesce(NEW.citizen_validation_answer, '')) in ('resolved', 'yes');

  notification_message := case
    when validation_resolved then
      citizen_display_name || ' validated complaint #' || short_id_text || ' as resolved. Review and approve completion.'
    else
      citizen_display_name || ' reported complaint #' || short_id_text || ' as unresolved. Review and decide next action.'
  end;

  for admin_record in
    select id
    from public.profiles
    where role in ('admin', 'Admin')
  loop
    insert into public.admin_notifications (
      admin_id,
      complaint_id,
      type,
      title,
      message,
      status,
      category,
      department,
      location_text,
      is_read,
      metadata
    )
    values (
      admin_record.id,
      NEW.id,
      'citizen_validation',
      'Citizen Validation Submitted',
      notification_message,
      coalesce(NEW.status, 'For Validation'),
      NEW.category,
      NEW.assigned_office,
      NEW.location_text,
      false,
      jsonb_build_object(
        'short_id', short_id_text,
        'complaint_title', NEW.title,
        'title', NEW.title,
        'category', NEW.category,
        'assigned_office', NEW.assigned_office,
        'location_text', NEW.location_text,
        'citizen_name', citizen_display_name,
        'validation_answer', NEW.citizen_validation_answer,
        'new_status', coalesce(NEW.status, 'For Validation'),
        'open_details', true
      )
    );
  end loop;

  return NEW;
end;
$$;

notify pgrst, 'reload schema';
