-- Durable, PII-free state for evidence-based listing quality quarantine.
-- A listing is quarantined only after two distinct definitive missing-image checks.
create table if not exists public.listing_quality_state (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  issue_code text not null default 'NO_REACHABLE_IMAGE'
    check (issue_code = 'NO_REACHABLE_IMAGE'),
  status text not null default 'SUSPECT'
    check (status in ('HEALTHY', 'SUSPECT', 'QUARANTINED', 'RESOLVED')),
  last_observation text not null default 'DEFINITELY_MISSING'
    check (last_observation in ('AVAILABLE', 'DEFINITELY_MISSING', 'UNKNOWN')),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  first_failed_at timestamp with time zone,
  last_checked_at timestamp with time zone not null default timezone('utc'::text, now()),
  previous_listing_status text
    check (previous_listing_status is null or previous_listing_status in ('ACTIVE_PUBLIC', 'ACTIVE_PREMIUM')),
  quarantined_at timestamp with time zone,
  resolved_at timestamp with time zone,
  notification_status text not null default 'not_sent'
    check (notification_status in ('not_sent', 'pending', 'accepted', 'failed')),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists listing_quality_state_attention_idx
  on public.listing_quality_state (status, last_checked_at);

drop trigger if exists set_listing_quality_state_updated_at on public.listing_quality_state;
create trigger set_listing_quality_state_updated_at
  before update on public.listing_quality_state
  for each row execute procedure public.set_updated_at();

alter table public.listing_quality_state enable row level security;
revoke all on public.listing_quality_state from anon, authenticated;

drop policy if exists "Sellers can view quality state for their listings" on public.listing_quality_state;
create policy "Sellers can view quality state for their listings"
  on public.listing_quality_state for select to authenticated
  using (exists (
    select 1 from public.listings
    where listings.id = listing_quality_state.listing_id
      and listings.seller_id = auth.uid()
  ));

drop policy if exists "Admins can manage listing quality state" on public.listing_quality_state;
create policy "Admins can manage listing quality state"
  on public.listing_quality_state for all to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

alter table public.commercial_notification_receipts
  drop constraint if exists commercial_notification_receipts_notification_type_check;

alter table public.commercial_notification_receipts
  add constraint commercial_notification_receipts_notification_type_check
    check (notification_type in (
      'listing_created_admin',
      'quote_created_admin',
      'wanted_request_admin',
      'listing_quality_quarantine'
    ));
