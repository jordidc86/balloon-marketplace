alter table public.commercial_notification_receipts
  add column if not exists delivery_attempts integer not null default 0,
  add column if not exists next_attempt_at timestamp with time zone;

update public.commercial_notification_receipts
set delivery_attempts = 1
where attempted_at is not null and delivery_attempts = 0;

alter table public.commercial_notification_receipts
  drop constraint if exists commercial_notification_receipts_delivery_attempts_check;

alter table public.commercial_notification_receipts
  add constraint commercial_notification_receipts_delivery_attempts_check
  check (delivery_attempts between 0 and 2);

create index if not exists commercial_notification_receipts_retry_idx
  on public.commercial_notification_receipts (next_attempt_at, notification_type)
  where status in ('pending', 'failed') and delivery_attempts < 2;

comment on column public.commercial_notification_receipts.delivery_attempts is
  'Provider delivery attempts. Transactional messages have a closed budget of two attempts.';

comment on column public.commercial_notification_receipts.next_attempt_at is
  'Earliest safe retry time after a failed or interrupted provider attempt; null when accepted or exhausted.';
