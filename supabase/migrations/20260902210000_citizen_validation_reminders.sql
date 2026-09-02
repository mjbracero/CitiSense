-- Remind citizens to validate complaints stuck in "For Validation".
-- Sends in-app + push notifications (via complaint_notifications trigger).

alter table public.complaints
  add column if not exists for_validation_at timestamptz,
  add column if not exists last_validation_reminder_at timestamptz;

update public.complaints
set for_validation_at = coalesce(created_at, now())
where status = 'For Validation'
  and citizen_validated_at is null
  and for_validation_at is null;

create or replace function public.sync_complaint_for_validation_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.status = 'For Validation' then
    if TG_OP = 'INSERT' or OLD.status is distinct from 'For Validation' then
      NEW.for_validation_at := coalesce(NEW.for_validation_at, now());
    end if;
  else
    NEW.for_validation_at := null;
    NEW.last_validation_reminder_at := null;
  end if;

  if NEW.citizen_validated_at is not null then
    NEW.last_validation_reminder_at := null;
  end if;

  return NEW;
end;
$$;

drop trigger if exists complaints_sync_for_validation_at on public.complaints;

create trigger complaints_sync_for_validation_at
before insert or update of status, citizen_validated_at
on public.complaints
for each row
execute function public.sync_complaint_for_validation_at();

create or replace function public.send_citizen_validation_reminders(
  p_citizen_id uuid default null,
  p_first_after interval default interval '24 hours',
  p_repeat_after interval default interval '48 hours'
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  complaint_row record;
  sent_count integer := 0;
  short_id_text text;
  notification_message text;
begin
  for complaint_row in
    select c.*
    from public.complaints c
    where c.status = 'For Validation'
      and c.citizen_validated_at is null
      and c.citizen_id is not null
      and c.for_validation_at is not null
      and c.for_validation_at <= now() - p_first_after
      and (
        c.last_validation_reminder_at is null
        or c.last_validation_reminder_at <= now() - p_repeat_after
      )
      and (p_citizen_id is null or c.citizen_id = p_citizen_id)
      and not exists (
        select 1
        from public.complaint_notifications n
        where n.complaint_id = c.id
          and n.type = 'validation_reminder'
          and n.created_at > now() - p_repeat_after
      )
  loop
    short_id_text := coalesce(
      nullif(trim(complaint_row.short_id), ''),
      left(complaint_row.id::text, 8)
    );

    notification_message :=
      'Reminder: Complaint #' || short_id_text ||
      ' is waiting for your validation. Please confirm whether the issue was resolved.';

    insert into public.complaint_notifications (
      citizen_id,
      complaint_id,
      type,
      title,
      message,
      status,
      is_read,
      metadata
    )
    values (
      complaint_row.citizen_id,
      complaint_row.id,
      'validation_reminder',
      'Validation Reminder',
      notification_message,
      'For Validation',
      false,
      jsonb_build_object(
        'short_id', short_id_text,
        'complaint_title', complaint_row.title,
        'title', complaint_row.title,
        'category', complaint_row.category,
        'assigned_office', complaint_row.assigned_office,
        'open_validation', true,
        'reminder', true
      )
    );

    update public.complaints
    set last_validation_reminder_at = now()
    where id = complaint_row.id;

    sent_count := sent_count + 1;
  end loop;

  return sent_count;
end;
$$;

create or replace function public.send_validation_reminders_for_citizen(p_citizen_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> p_citizen_id then
    raise exception 'Unauthorized';
  end if;

  return public.send_citizen_validation_reminders(
    p_citizen_id,
    interval '24 hours',
    interval '48 hours'
  );
end;
$$;

revoke all on function public.send_citizen_validation_reminders(uuid, interval, interval) from public;
grant execute on function public.send_validation_reminders_for_citizen(uuid) to authenticated;
