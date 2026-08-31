-- Listing freshness is used by search discovery, seller operations and audits.
-- Keep it truthful for every future mutation and repair historical closures from
-- the immutable lifecycle event rather than from an inferred timestamp.

drop trigger if exists set_listings_updated_at on public.listings;
create trigger set_listings_updated_at
  before update on public.listings
  for each row execute procedure public.set_updated_at();

update public.listings as listing
set updated_at = greatest(listing.updated_at, lifecycle.created_at)
from public.listing_lifecycle_events as lifecycle
where lifecycle.listing_id = listing.id
  and lifecycle.event_type = 'SOLD'
  and lifecycle.created_at > listing.updated_at;

comment on trigger set_listings_updated_at on public.listings is
  'Refreshes listing freshness on every mutation so public search and operational audits observe real state changes.';
