-- Capture consented, listing-specific buyer intent before a buyer is ready to
-- submit a full enquiry. Watchers and delivery evidence remain private.

create table if not exists public.listing_watchers (
  id uuid default gen_random_uuid() primary key,
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_user_id uuid references public.users(id) on delete set null,
  email text not null check (char_length(email) between 5 and 320),
  normalized_email text not null check (
    char_length(normalized_email) between 5 and 320
    and normalized_email = lower(trim(email))
  ),
  status text not null default 'PENDING_CONFIRMATION' check (
    status in ('PENDING_CONFIRMATION', 'ACTIVE', 'UNSUBSCRIBED', 'BLOCKED')
  ),
  privacy_consent_at timestamp with time zone not null default timezone('utc'::text, now()),
  confirmed_at timestamp with time zone,
  unsubscribed_at timestamp with time zone,
  submission_key text check (submission_key is null or char_length(submission_key) = 64),
  source_context text not null default 'listing_detail' check (source_context = 'listing_detail'),
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 255),
  utm_source text check (utm_source is null or char_length(utm_source) <= 120),
  utm_medium text check (utm_medium is null or char_length(utm_medium) <= 120),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 120),
  journey_key text check (journey_key is null or char_length(journey_key) = 64),
  initial_snapshot_hash text not null check (char_length(initial_snapshot_hash) = 64),
  last_notified_snapshot_hash text check (last_notified_snapshot_hash is null or char_length(last_notified_snapshot_hash) = 64),
  last_notified_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (listing_id, normalized_email),
  unique (id, listing_id),
  constraint listing_watchers_confirmation_state check (
    (status = 'ACTIVE' and confirmed_at is not null and unsubscribed_at is null)
    or (status = 'UNSUBSCRIBED' and unsubscribed_at is not null)
    or status in ('PENDING_CONFIRMATION', 'BLOCKED')
  )
);

create index if not exists listing_watchers_listing_status_idx
  on public.listing_watchers (listing_id, status, updated_at desc);
create index if not exists listing_watchers_submission_rate_idx
  on public.listing_watchers (submission_key, created_at desc)
  where submission_key is not null;

drop trigger if exists set_listing_watchers_updated_at on public.listing_watchers;
create trigger set_listing_watchers_updated_at
  before update on public.listing_watchers
  for each row execute procedure public.set_updated_at();

alter table public.listing_watchers enable row level security;
revoke all on public.listing_watchers from anon, authenticated;
drop policy if exists "Admins can manage listing watchers" on public.listing_watchers;
create policy "Admins can manage listing watchers"
  on public.listing_watchers for all to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create table if not exists public.listing_watch_dispatches (
  id uuid default gen_random_uuid() primary key,
  watcher_id uuid not null references public.listing_watchers(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  snapshot_hash text not null check (char_length(snapshot_hash) = 64),
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'FAILED', 'CANCELLED')),
  provider_message_id text,
  attempted_at timestamp with time zone,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (watcher_id, snapshot_hash),
  constraint listing_watch_dispatches_watcher_listing_fk
    foreign key (watcher_id, listing_id) references public.listing_watchers(id, listing_id) on delete cascade,
  constraint listing_watch_dispatches_delivery_state check (
    (status = 'ACCEPTED' and accepted_at is not null and provider_message_id is not null)
    or (status in ('PENDING', 'FAILED', 'CANCELLED') and accepted_at is null)
  )
);

create index if not exists listing_watch_dispatches_status_idx
  on public.listing_watch_dispatches (status, updated_at);

drop trigger if exists set_listing_watch_dispatches_updated_at on public.listing_watch_dispatches;
create trigger set_listing_watch_dispatches_updated_at
  before update on public.listing_watch_dispatches
  for each row execute procedure public.set_updated_at();

alter table public.listing_watch_dispatches enable row level security;
revoke all on public.listing_watch_dispatches from anon, authenticated;
drop policy if exists "Admins can manage listing watch dispatches" on public.listing_watch_dispatches;
create policy "Admins can manage listing watch dispatches"
  on public.listing_watch_dispatches for all to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

alter table public.commercial_notification_receipts
  drop constraint if exists commercial_notification_receipts_notification_type_check,
  drop constraint if exists commercial_notification_receipts_entity_type_check;

alter table public.commercial_notification_receipts
  add constraint commercial_notification_receipts_notification_type_check check (notification_type in (
    'listing_created_admin','quote_created_admin','wanted_request_admin','listing_quality_quarantine','inquiry_buyer_ack',
    'inquiry_seller_followup','inquiry_buyer_seller_response','quote_admin_followup','premium_listing_checkout_recovery',
    'wanted_match_buyer','listing_verification_requested','listing_verification_decision','seller_assistance_created_admin',
    'seller_assistance_admin_followup','new_balloon_proposal_buyer','listing_watch_confirmation','listing_watch_update'
  )),
  add constraint commercial_notification_receipts_entity_type_check check (entity_type in (
    'listing','quote_request','wanted_request','inquiry','seller_assistance','quote_proposal','listing_watch'
  ));

comment on table public.listing_watchers is
  'Private double-opt-in buyer interest in one listing. It is not an enquiry, reservation, payment or marketing subscription.';
comment on table public.listing_watch_dispatches is
  'Private idempotent provider evidence for material listing-change alerts.';
