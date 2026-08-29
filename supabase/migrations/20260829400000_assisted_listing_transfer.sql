-- Allow an owner to reduce duplicate work by giving AeroTrade a public source advert.
-- The URL is reviewed manually; production never fetches, copies or publishes it automatically.

alter table public.seller_assistance_requests
  add column if not exists existing_listing_url text;

alter table public.seller_assistance_requests
  drop constraint if exists seller_assistance_existing_listing_url_check;

alter table public.seller_assistance_requests
  add constraint seller_assistance_existing_listing_url_check check (
    existing_listing_url is null
    or (
      char_length(existing_listing_url) <= 1000
      and existing_listing_url ~* '^https?://'
    )
  );

comment on column public.seller_assistance_requests.existing_listing_url is
  'Optional owner-supplied public advert URL for manual transfer review; never fetched or published automatically.';

