alter table public.quote_requests
  add column if not exists requested_category text,
  add column if not exists requested_equipment text,
  add column if not exists requested_country text,
  add column if not exists privacy_consent_at timestamp with time zone,
  add column if not exists submission_key text;

alter table public.quote_requests
  drop constraint if exists quote_requests_requested_category_check;

alter table public.quote_requests
  add constraint quote_requests_requested_category_check
  check (
    requested_category is null or requested_category in (
      'complete', 'envelopes', 'baskets', 'burners', 'bottom-end',
      'cylinders', 'other-equipment'
    )
  );

create index if not exists quote_requests_recent_duplicate_idx
  on public.quote_requests (lower(email), equipment_type, created_at desc);

create index if not exists quote_requests_submission_rate_idx
  on public.quote_requests (submission_key, created_at desc)
  where submission_key is not null;

alter table public.quote_requests enable row level security;
revoke all on public.quote_requests from anon, authenticated;

comment on column public.quote_requests.requested_equipment is
  'Bounded, contact-free demand context voluntarily carried from a catalog search.';
comment on column public.quote_requests.submission_key is
  'HMAC-based abuse-control key; never stores an IP address or raw browser identifier.';
comment on column public.quote_requests.privacy_consent_at is
  'Timestamp at which the buyer explicitly asked AeroTrade to respond to the quotation request.';
