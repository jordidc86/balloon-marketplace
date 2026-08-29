-- Make funnel events attributable and resistant to inflated browser refreshes.
-- event_key is a server-generated hash; no raw visitor identifier is stored.
alter table public.listing_events
  add column if not exists event_key text,
  add column if not exists referrer_host text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;

create unique index if not exists listing_events_event_key_unique
  on public.listing_events (event_key)
  where event_key is not null;

create index if not exists listing_events_attribution_idx
  on public.listing_events (utm_source, event_type, created_at desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'listing_events_event_key_length') then
    alter table public.listing_events add constraint listing_events_event_key_length
      check (event_key is null or char_length(event_key) = 64);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'listing_events_referrer_host_length') then
    alter table public.listing_events add constraint listing_events_referrer_host_length
      check (referrer_host is null or char_length(referrer_host) <= 255);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'listing_events_utm_source_length') then
    alter table public.listing_events add constraint listing_events_utm_source_length
      check (utm_source is null or char_length(utm_source) <= 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'listing_events_utm_medium_length') then
    alter table public.listing_events add constraint listing_events_utm_medium_length
      check (utm_medium is null or char_length(utm_medium) <= 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'listing_events_utm_campaign_length') then
    alter table public.listing_events add constraint listing_events_utm_campaign_length
      check (utm_campaign is null or char_length(utm_campaign) <= 120);
  end if;
end $$;
