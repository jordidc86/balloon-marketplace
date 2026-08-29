-- Join acquisition and conversion stages with a daily HMAC journey key. The
-- browser UUID/user id is never stored in this key or in any attribution field.

alter table public.listing_events
  add column if not exists journey_key text;
alter table public.catalog_search_events
  add column if not exists journey_key text;
alter table public.marketplace_inquiries
  add column if not exists journey_key text,
  add column if not exists referrer_host text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;
alter table public.wanted_requests
  add column if not exists journey_key text;
alter table public.quote_requests
  add column if not exists journey_key text,
  add column if not exists referrer_host text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;

alter table public.listing_events
  drop constraint if exists listing_events_journey_key_length,
  add constraint listing_events_journey_key_length check (journey_key is null or char_length(journey_key) = 64);
alter table public.catalog_search_events
  drop constraint if exists catalog_search_events_journey_key_length,
  add constraint catalog_search_events_journey_key_length check (journey_key is null or char_length(journey_key) = 64);
alter table public.marketplace_inquiries
  drop constraint if exists marketplace_inquiries_journey_key_length,
  drop constraint if exists marketplace_inquiries_referrer_host_length,
  drop constraint if exists marketplace_inquiries_utm_source_length,
  drop constraint if exists marketplace_inquiries_utm_medium_length,
  drop constraint if exists marketplace_inquiries_utm_campaign_length,
  add constraint marketplace_inquiries_journey_key_length check (journey_key is null or char_length(journey_key) = 64),
  add constraint marketplace_inquiries_referrer_host_length check (referrer_host is null or char_length(referrer_host) <= 255),
  add constraint marketplace_inquiries_utm_source_length check (utm_source is null or char_length(utm_source) <= 120),
  add constraint marketplace_inquiries_utm_medium_length check (utm_medium is null or char_length(utm_medium) <= 120),
  add constraint marketplace_inquiries_utm_campaign_length check (utm_campaign is null or char_length(utm_campaign) <= 120);
alter table public.wanted_requests
  drop constraint if exists wanted_requests_journey_key_length,
  add constraint wanted_requests_journey_key_length check (journey_key is null or char_length(journey_key) = 64);
alter table public.quote_requests
  drop constraint if exists quote_requests_journey_key_length,
  drop constraint if exists quote_requests_referrer_host_length,
  drop constraint if exists quote_requests_utm_source_length,
  drop constraint if exists quote_requests_utm_medium_length,
  drop constraint if exists quote_requests_utm_campaign_length,
  add constraint quote_requests_journey_key_length check (journey_key is null or char_length(journey_key) = 64),
  add constraint quote_requests_referrer_host_length check (referrer_host is null or char_length(referrer_host) <= 255),
  add constraint quote_requests_utm_source_length check (utm_source is null or char_length(utm_source) <= 120),
  add constraint quote_requests_utm_medium_length check (utm_medium is null or char_length(utm_medium) <= 120),
  add constraint quote_requests_utm_campaign_length check (utm_campaign is null or char_length(utm_campaign) <= 120);

create index if not exists listing_events_journey_idx
  on public.listing_events (journey_key, event_type, created_at)
  where journey_key is not null;
create index if not exists catalog_search_events_journey_idx
  on public.catalog_search_events (journey_key, created_at)
  where journey_key is not null;
create index if not exists marketplace_inquiries_journey_idx
  on public.marketplace_inquiries (journey_key, created_at)
  where journey_key is not null;
create index if not exists wanted_requests_journey_idx
  on public.wanted_requests (journey_key, created_at)
  where journey_key is not null;
create index if not exists quote_requests_journey_idx
  on public.quote_requests (journey_key, created_at)
  where journey_key is not null;

comment on column public.listing_events.journey_key is
  'Daily server-HMAC journey key; contains no raw visitor or user identifier.';
comment on column public.catalog_search_events.journey_key is
  'Daily server-HMAC journey key; contains no raw visitor or user identifier.';
comment on column public.marketplace_inquiries.journey_key is
  'Daily server-HMAC journey key linking consented conversion to acquisition without a raw visitor identifier.';
comment on column public.wanted_requests.journey_key is
  'Daily server-HMAC journey key linking consented demand to acquisition without a raw visitor identifier.';
comment on column public.quote_requests.journey_key is
  'Daily server-HMAC journey key linking a consented new-balloon lead to acquisition without a raw visitor identifier.';
