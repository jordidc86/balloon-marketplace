create or replace function public.confirm_listing_availability_from_seller_digest(
  p_seller_id uuid,
  p_digest_key text,
  p_listing_ids uuid[]
)
returns table(listing_id uuid, confirmation_id uuid, confirmed_at timestamp with time zone, confirmed_on date)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing_count integer;
begin
  if p_seller_id is null
    or p_digest_key !~ '^seller-availability-digest-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[0-9a-f]{32}(-[0-9]{8})?$'
    or p_digest_key not like 'seller-availability-digest-' || lower(p_seller_id::text) || '-%'
    or coalesce(cardinality(p_listing_ids), 0) < 1
    or cardinality(p_listing_ids) > 100 then
    raise exception 'Invalid seller availability authority';
  end if;

  if (
    select count(distinct scope.scoped_listing_id)
    from unnest(p_listing_ids) as scope(scoped_listing_id)
  ) <> cardinality(p_listing_ids) then
    raise exception 'Duplicate listing identifiers are not permitted';
  end if;

  if not exists (
    select 1
    from public.commercial_notification_receipts receipt
    where receipt.notification_type = 'seller_availability_digest'
      and receipt.entity_type = 'user'
      and receipt.entity_id = p_seller_id
      and receipt.idempotency_key = p_digest_key
      and receipt.status = 'accepted'
      and receipt.provider_message_id is not null
      and receipt.accepted_at >= now() - interval '15 days'
  ) then
    raise exception 'Accepted seller availability digest is required';
  end if;

  perform listing.id
  from public.listings listing
  where listing.id = any(p_listing_ids)
  order by listing.id
  for update;

  select count(*) into v_listing_count
  from public.listings listing
  where listing.id = any(p_listing_ids)
    and listing.seller_id = p_seller_id
    and listing.status in ('ACTIVE_PUBLIC', 'ACTIVE_PREMIUM');

  if v_listing_count <> cardinality(p_listing_ids) then
    raise exception 'Digest listing scope no longer matches active seller inventory';
  end if;

  insert into public.listing_availability_confirmations (
    listing_id,
    seller_id,
    listing_status,
    source,
    confirmed_on
  )
  select
    listing.id,
    p_seller_id,
    listing.status,
    'SELLER_EMAIL_CAPABILITY',
    current_date
  from public.listings listing
  where listing.id = any(p_listing_ids)
    and listing.seller_id = p_seller_id
    and listing.status in ('ACTIVE_PUBLIC', 'ACTIVE_PREMIUM')
  on conflict on constraint listing_availability_confirmations_listing_id_confirmed_on_key do nothing;

  return query
  select
    listing.id,
    confirmation.id,
    confirmation.confirmed_at,
    confirmation.confirmed_on
  from public.listings listing
  join public.listing_availability_confirmations confirmation
    on confirmation.listing_id = listing.id
    and confirmation.seller_id = p_seller_id
    and confirmation.confirmed_on = current_date
  where listing.id = any(p_listing_ids)
    and listing.seller_id = p_seller_id
    and listing.status in ('ACTIVE_PUBLIC', 'ACTIVE_PREMIUM')
  order by listing.id;
end;
$$;

revoke all on function public.confirm_listing_availability_from_seller_digest(uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.confirm_listing_availability_from_seller_digest(uuid, text, uuid[]) to service_role;

comment on function public.confirm_listing_availability_from_seller_digest(uuid, text, uuid[]) is
  'Records bounded seller availability from a current provider-accepted initial or explicitly reissued private email capability. It never changes publication, price, payment or ownership.';
