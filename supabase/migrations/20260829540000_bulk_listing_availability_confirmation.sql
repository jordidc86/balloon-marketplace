create or replace function public.confirm_all_listing_availability()
returns table(listing_id uuid, confirmation_id uuid, confirmed_at timestamp with time zone, confirmed_on date)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform listing.id
  from public.listings listing
  where listing.seller_id = v_user_id
    and listing.status in ('ACTIVE_PUBLIC', 'ACTIVE_PREMIUM')
  order by listing.id
  for update;

  insert into public.listing_availability_confirmations (
    listing_id,
    seller_id,
    listing_status,
    source,
    confirmed_on
  )
  select
    listing.id,
    v_user_id,
    listing.status,
    'SELLER_DASHBOARD',
    current_date
  from public.listings listing
  where listing.seller_id = v_user_id
    and listing.status in ('ACTIVE_PUBLIC', 'ACTIVE_PREMIUM')
  on conflict (listing_id, confirmed_on) do nothing;

  return query
  select
    listing.id,
    confirmation.id,
    confirmation.confirmed_at,
    confirmation.confirmed_on
  from public.listings listing
  join public.listing_availability_confirmations confirmation
    on confirmation.listing_id = listing.id
    and confirmation.seller_id = v_user_id
    and confirmation.confirmed_on = current_date
  where listing.seller_id = v_user_id
    and listing.status in ('ACTIVE_PUBLIC', 'ACTIVE_PREMIUM')
  order by listing.id;
end;
$$;

revoke all on function public.confirm_all_listing_availability() from public, anon;
grant execute on function public.confirm_all_listing_availability() to authenticated;

comment on function public.confirm_all_listing_availability() is
  'Lets an authenticated seller explicitly confirm every currently active owned listing in one action. It creates the same immutable per-listing evidence as the individual dashboard action and never changes publication, price, payment or ownership.';
