-- Preserve an immutable newsletter content snapshot and audit any explicitly
-- approved recovery of failed recipients. No public or authenticated client
-- receives policies for these service-role-only tables.

alter table public.newsletter_runs
  add column if not exists subject text,
  add column if not exists html_body text,
  add column if not exists content_sha256 text,
  add column if not exists provider_dispatch_started_at timestamptz;

alter table public.newsletter_runs
  drop constraint if exists newsletter_runs_status_check;

alter table public.newsletter_runs
  add constraint newsletter_runs_status_check
  check (status in ('running', 'sent', 'partial', 'failed', 'skipped', 'audit_uncertain'));

drop index if exists public.newsletter_runs_one_live_send_per_period;

create unique index newsletter_runs_one_live_send_per_period
  on public.newsletter_runs (period_key)
  where dry_run = false
    and test_email is null
    and status in ('running', 'sent', 'partial', 'audit_uncertain');

create table if not exists public.newsletter_recovery_runs (
  id uuid primary key default gen_random_uuid(),
  original_run_id uuid not null references public.newsletter_runs(id) on delete restrict,
  status text not null default 'running'
    check (status in ('running', 'sent', 'partial', 'failed', 'audit_uncertain', 'abandoned')),
  dry_run boolean not null default false,
  reason text not null,
  expected_failed_count integer not null check (expected_failed_count > 0),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  content_sha256 text not null,
  provider_dispatch_started_at timestamptz,
  resend_message_ids text[] not null default '{}',
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists newsletter_recovery_one_live_attempt
  on public.newsletter_recovery_runs (original_run_id)
  where dry_run = false and status in ('running', 'sent', 'partial', 'failed', 'audit_uncertain');

create index if not exists newsletter_recovery_runs_original_idx
  on public.newsletter_recovery_runs (original_run_id, created_at desc);

create table if not exists public.newsletter_recovery_recipients (
  id uuid primary key default gen_random_uuid(),
  recovery_run_id uuid not null references public.newsletter_recovery_runs(id) on delete cascade,
  email text not null,
  status text not null check (status in ('sent', 'failed')),
  resend_id text,
  error_message text,
  created_at timestamptz not null default now(),
  unique (recovery_run_id, email)
);

create index if not exists newsletter_recovery_recipients_run_idx
  on public.newsletter_recovery_recipients (recovery_run_id, status);

alter table public.newsletter_recovery_runs enable row level security;
alter table public.newsletter_recovery_recipients enable row level security;
