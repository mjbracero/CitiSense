-- Mirror the citizen complaint_notifications push trigger for admin +
-- department-head tables so FCM still fires when their app is closed.
-- Uses the same vault secret + dispatch-notification-push edge function.

create extension if not exists pg_net with schema extensions;

-- Admin notifications → FCM (same plumbing as citizens)
create or replace function public.dispatch_admin_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  service_role_key text;
  project_url text := 'https://eylztwbrgnglsxqudcgh.supabase.co';
begin
  begin
    select decrypted_secret
    into service_role_key
    from vault.decrypted_secrets
    where name = 'service_role_key'
    limit 1;
  exception
    when others then
      return NEW;
  end;

  if service_role_key is null or service_role_key = '' then
    return NEW;
  end if;

  perform net.http_post(
    url := project_url || '/functions/v1/dispatch-notification-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'admin_notifications',
      'record', jsonb_build_object(
        'id', NEW.id,
        'admin_id', NEW.admin_id,
        'complaint_id', NEW.complaint_id,
        'title', NEW.title,
        'message', NEW.message
      )
    )
  );

  return NEW;
end;
$$;

drop trigger if exists admin_notifications_push_trigger on public.admin_notifications;

create trigger admin_notifications_push_trigger
after insert on public.admin_notifications
for each row
execute function public.dispatch_admin_notification_push();

-- Department head (moderator) notifications → FCM
create or replace function public.dispatch_moderator_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  service_role_key text;
  project_url text := 'https://eylztwbrgnglsxqudcgh.supabase.co';
begin
  begin
    select decrypted_secret
    into service_role_key
    from vault.decrypted_secrets
    where name = 'service_role_key'
    limit 1;
  exception
    when others then
      return NEW;
  end;

  if service_role_key is null or service_role_key = '' then
    return NEW;
  end if;

  perform net.http_post(
    url := project_url || '/functions/v1/dispatch-notification-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'moderator_notifications',
      'record', jsonb_build_object(
        'id', NEW.id,
        'moderator_id', NEW.moderator_id,
        'complaint_id', NEW.complaint_id,
        'title', NEW.title,
        'message', NEW.message
      )
    )
  );

  return NEW;
end;
$$;

drop trigger if exists moderator_notifications_push_trigger on public.moderator_notifications;

create trigger moderator_notifications_push_trigger
after insert on public.moderator_notifications
for each row
execute function public.dispatch_moderator_notification_push();

-- Clean up older combined helper if it was applied previously.
drop function if exists public.dispatch_role_notification_push() cascade;
