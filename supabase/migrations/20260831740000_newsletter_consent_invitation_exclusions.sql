create table if not exists public.newsletter_consent_invitation_exclusions (
  user_id uuid primary key references public.users(id) on delete cascade,
  reason text not null check (reason in ('NON_CUSTOMER', 'TEST_ACCOUNT', 'OPERATOR_EXCLUDED')),
  excluded_by uuid not null references public.users(id) on delete restrict,
  excluded_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.newsletter_consent_invitation_exclusions enable row level security;

comment on table public.newsletter_consent_invitation_exclusions is
  'Durable administrative exclusions from the one-time newsletter consent invitation. This table changes no consent preference and grants no marketing permission.';
comment on column public.newsletter_consent_invitation_exclusions.reason is
  'Closed, non-PII reason for excluding an account from one-time consent outreach.';

