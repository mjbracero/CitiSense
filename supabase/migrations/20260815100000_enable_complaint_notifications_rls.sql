-- Policies already exist on public.complaint_notifications, but RLS was never
-- enabled, so those policies were inactive (Supabase Advisors: CRITICAL).

alter table public.complaint_notifications
  enable row level security;
