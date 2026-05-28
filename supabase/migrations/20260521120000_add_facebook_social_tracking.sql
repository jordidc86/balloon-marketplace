alter table public.listings
  add column if not exists facebook_posted boolean default false;

alter table public.listings
  add column if not exists social_last_posted_at timestamp with time zone;

comment on column public.listings.instagram_posted is
  'Legacy marker for whether the listing has ever been published to Instagram.';

comment on column public.listings.facebook_posted is
  'Legacy marker for whether the listing has ever been published to the AeroTrade Facebook Page.';

comment on column public.listings.social_last_posted_at is
  'Tracks the last time this listing was included in the rotating daily social publishing queue.';
