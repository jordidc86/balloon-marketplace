-- Private assisted-sale intake for owners who are not yet ready to publish a
-- complete listing. This complements, but never replaces, the normal listing.

create table if not exists public.seller_assistance_requests (
  id uuid default uuid_generate_v4() primary key,
  seller_user_id uuid references public.users(id) on delete set null,
  linked_listing_id uuid references public.listings(id) on delete set null,
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) between 3 and 320),
  phone text check (phone is null or char_length(phone) <= 60),
  category text not null check (category in ('complete', 'envelopes', 'baskets', 'burners', 'bottom-end', 'cylinders', 'other-equipment')),
  manufacturer text check (manufacturer is null or char_length(manufacturer) <= 120),
  model text check (model is null or char_length(model) <= 120),
  manufacture_year integer check (manufacture_year is null or manufacture_year between 1900 and 2200),
  location_country text check (location_country is null or char_length(location_country) <= 100),
  expected_price_minor bigint check (expected_price_minor is null or expected_price_minor >= 0),
  currency text not null default 'EUR' check (currency in ('EUR', 'GBP', 'USD')),
  documentation_readiness text not null default 'UNKNOWN' check (documentation_readiness in ('READY', 'PARTIAL', 'NOT_READY', 'UNKNOWN')),
  photo_readiness text not null default 'UNKNOWN' check (photo_readiness in ('READY', 'PARTIAL', 'NOT_READY', 'UNKNOWN')),
  timeline text not null default 'EXPLORING' check (timeline in ('NOW', '0_3_MONTHS', '3_6_MONTHS', 'EXPLORING')),
  help_needed text[] not null default '{}'::text[] check (help_needed <@ array['VALUATION', 'LISTING_PREPARATION', 'PHOTO_GUIDANCE', 'DOCUMENT_CHECK']::text[]),
  notes text check (notes is null or char_length(notes) <= 2000),
  source_context text not null default 'sell_assisted' check (source_context = 'sell_assisted'),
  status text not null default 'NEW' check (status in ('NEW', 'CONTACTED', 'QUALIFIED', 'LISTING_PREPARATION', 'LISTED', 'CLOSED', 'SPAM')),
  privacy_consent_at timestamp with time zone not null,
  submission_key text check (submission_key is null or char_length(submission_key) = 64),
  journey_key text check (journey_key is null or char_length(journey_key) = 64),
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 255),
  utm_source text check (utm_source is null or char_length(utm_source) <= 120),
  utm_medium text check (utm_medium is null or char_length(utm_medium) <= 120),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 120),
  last_activity_at timestamp with time zone not null default timezone('utc'::text, now()),
  closed_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint seller_assistance_closed_state check (
    (status in ('CLOSED', 'SPAM') and closed_at is not null)
    or (status not in ('CLOSED', 'SPAM') and closed_at is null)
  ),
  constraint seller_assistance_listed_link check (status <> 'LISTED' or linked_listing_id is not null)
);

create index if not exists seller_assistance_status_activity_idx
  on public.seller_assistance_requests (status, last_activity_at asc);
create index if not exists seller_assistance_email_created_idx
  on public.seller_assistance_requests (lower(email), category, created_at desc);
create index if not exists seller_assistance_submission_rate_idx
  on public.seller_assistance_requests (submission_key, created_at desc)
  where submission_key is not null;
create index if not exists seller_assistance_journey_idx
  on public.seller_assistance_requests (journey_key, created_at)
  where journey_key is not null;

drop trigger if exists set_seller_assistance_updated_at on public.seller_assistance_requests;
create trigger set_seller_assistance_updated_at
  before update on public.seller_assistance_requests
  for each row execute procedure public.set_updated_at();

alter table public.seller_assistance_requests enable row level security;
revoke all on public.seller_assistance_requests from anon, authenticated;

drop policy if exists "Admins can manage seller assistance" on public.seller_assistance_requests;
create policy "Admins can manage seller assistance"
  on public.seller_assistance_requests for all to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

alter table public.commercial_notification_receipts
  drop constraint if exists commercial_notification_receipts_notification_type_check,
  drop constraint if exists commercial_notification_receipts_entity_type_check;

alter table public.commercial_notification_receipts
  add constraint commercial_notification_receipts_notification_type_check
    check (notification_type in (
      'listing_created_admin', 'quote_created_admin', 'wanted_request_admin',
      'listing_quality_quarantine', 'inquiry_buyer_ack',
      'inquiry_seller_followup', 'quote_admin_followup',
      'premium_listing_checkout_recovery', 'wanted_match_buyer',
      'listing_verification_requested', 'listing_verification_decision',
      'seller_assistance_created_admin', 'seller_assistance_admin_followup'
    )),
  add constraint commercial_notification_receipts_entity_type_check
    check (entity_type in ('listing', 'quote_request', 'wanted_request', 'inquiry', 'seller_assistance'));

comment on table public.seller_assistance_requests is
  'Private seller assistance leads; never published and never used to create a listing without the owner completing the normal listing workflow.';
comment on column public.seller_assistance_requests.submission_key is
  'One-way abuse-control key; contains no raw IP address or browser identifier.';
comment on column public.seller_assistance_requests.journey_key is
  'Daily server-HMAC attribution key; contains no raw visitor or user identifier.';

