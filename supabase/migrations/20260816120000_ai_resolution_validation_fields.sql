-- AI resolution validation fields used after citizen submits validation
-- evidence and before admin can mark a complaint Completed.

alter table public.complaints
  add column if not exists ai_validation_status text,
  add column if not exists ai_validation_approved boolean,
  add column if not exists ai_validation_confidence double precision,
  add column if not exists ai_validation_summary text,
  add column if not exists ai_validation_reason text,
  add column if not exists ai_validation_supports_citizen boolean,
  add column if not exists ai_validation_recommendation text,
  add column if not exists ai_validation_result jsonb,
  add column if not exists ai_validated_at timestamptz;

comment on column public.complaints.ai_validation_status is
  'AI resolution check status: approved | rejected | error | pending';
comment on column public.complaints.ai_validation_approved is
  'True when AI approved citizen validation evidence for completion review';
