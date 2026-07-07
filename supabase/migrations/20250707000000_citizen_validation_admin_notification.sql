-- Notify all admins when a citizen submits validation feedback.
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

  if TG_OP = 'UPDATE' and OLD.citizen_validated_at is not null then
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

drop trigger if exists complaints_citizen_validation_admin_notify on public.complaints;

create trigger complaints_citizen_validation_admin_notify
after insert or update of citizen_validated_at, citizen_validation_answer, citizen_validation_feedback, citizen_validation_photo_urls
on public.complaints
for each row
execute function public.notify_admins_on_citizen_validation();
