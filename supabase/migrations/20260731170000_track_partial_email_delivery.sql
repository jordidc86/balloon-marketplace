alter table public.newsletter_runs
  drop constraint if exists newsletter_runs_status_check;

alter table public.newsletter_runs
  add constraint newsletter_runs_status_check
  check (status in ('running', 'sent', 'partial', 'failed', 'skipped'));

drop index if exists public.newsletter_runs_one_live_send_per_period;

create unique index newsletter_runs_one_live_send_per_period
  on public.newsletter_runs (period_key)
  where dry_run = false
    and test_email is null
    and status in ('running', 'sent', 'partial');

alter table public.premium_alert_runs
  drop constraint if exists premium_alert_runs_status_check;

alter table public.premium_alert_runs
  add constraint premium_alert_runs_status_check
  check (status in ('running', 'sent', 'partial', 'failed', 'skipped'));

drop index if exists public.premium_alert_runs_one_success_per_listing;

create unique index premium_alert_runs_one_success_per_listing
  on public.premium_alert_runs (listing_id)
  where status in ('running', 'sent', 'partial');
