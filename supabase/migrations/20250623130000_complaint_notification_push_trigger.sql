-- Automatically dispatch FCM push when a citizen notification row is created.
-- Requires pg_net and the send-push-notification / dispatch-notification-push edge functions deployed.
-- Set the database secret once in Supabase SQL editor:
--   select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');

create extension if not exists pg_net with schema extensions;

create or replace function public.dispatch_complaint_notification_push()
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
      'table', 'complaint_notifications',
      'record', jsonb_build_object(
        'id', NEW.id,
        'citizen_id', NEW.citizen_id,
        'complaint_id', NEW.complaint_id,
        'title', NEW.title,
        'message', NEW.message
      )
    )
  );

  return NEW;
end;
$$;

drop trigger if exists complaint_notifications_push_trigger on public.complaint_notifications;

create trigger complaint_notifications_push_trigger
after insert on public.complaint_notifications
for each row
execute function public.dispatch_complaint_notification_push();
