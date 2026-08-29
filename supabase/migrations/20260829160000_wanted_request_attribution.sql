-- Bounded source attribution for wanted-equipment conversions.
-- No raw visitor identifier or full referrer URL is retained.

alter table public.wanted_requests
  add column if not exists referrer_host text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;

alter table public.wanted_requests
  drop constraint if exists wanted_requests_referrer_host_length,
  drop constraint if exists wanted_requests_utm_source_length,
  drop constraint if exists wanted_requests_utm_medium_length,
  drop constraint if exists wanted_requests_utm_campaign_length;

alter table public.wanted_requests
  add constraint wanted_requests_referrer_host_length check (referrer_host is null or char_length(referrer_host) <= 255),
  add constraint wanted_requests_utm_source_length check (utm_source is null or char_length(utm_source) <= 120),
  add constraint wanted_requests_utm_medium_length check (utm_medium is null or char_length(utm_medium) <= 120),
  add constraint wanted_requests_utm_campaign_length check (utm_campaign is null or char_length(utm_campaign) <= 120);

create index if not exists wanted_requests_attribution_idx
  on public.wanted_requests (utm_source, status, created_at desc);
