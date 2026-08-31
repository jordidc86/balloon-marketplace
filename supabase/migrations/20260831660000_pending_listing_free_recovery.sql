create or replace function public.publish_pending_listing_free(
  p_listing_id uuid,
  p_seller_id uuid,
  p_event_key text
)
returns table(listing_id uuid, status text, public_at timestamp with time zone, listing_plan text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
    or p_listing_id is null
    or p_seller_id is null
    or p_event_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid free publication authority';
  end if;

  select * into v_listing
  from public.listings listing
  where listing.id = p_listing_id
  for update;

  if not found
    or v_listing.seller_id <> p_seller_id
    or v_listing.status not in ('DRAFT', 'PENDING_PAYMENT')
    or coalesce(v_listing.details ->> 'listing_plan', '') not in ('free', 'premium') then
    raise exception 'Listing is not eligible for free publication';
  end if;

  if v_listing.status = 'DRAFT' and exists (
    select 1
    from public.listing_quality_state quality
    where quality.listing_id = p_listing_id
      and quality.previous_listing_status is not null
      and quality.status in ('QUARANTINED', 'RESOLVED')
  ) then
    raise exception 'Listing must use its existing quality recovery workflow';
  end if;

  update public.listings listing
  set status = 'ACTIVE_PUBLIC',
      public_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now()),
      details = jsonb_set(coalesce(listing.details, '{}'::jsonb), '{listing_plan}', '"free"'::jsonb, true)
  where listing.id = p_listing_id
    and listing.seller_id = p_seller_id;

  insert into public.seller_funnel_events (
    event_key,
    seller_id,
    listing_id,
    stage,
    listing_plan,
    source,
    entry_context
  ) values (
    p_event_key,
    p_seller_id,
    p_listing_id,
    'LISTING_PUBLISHED',
    'free',
    'recovery',
    'system'
  ) on conflict (event_key) do nothing;

  return query
  select listing.id, listing.status, listing.public_at, listing.details ->> 'listing_plan'
  from public.listings listing
  where listing.id = p_listing_id
    and listing.seller_id = p_seller_id;
end;
$$;

revoke all on function public.publish_pending_listing_free(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.publish_pending_listing_free(uuid, uuid, text) to service_role;

comment on function public.publish_pending_listing_free(uuid, uuid, text) is
  'Atomically publishes one server-verified seller-owned draft or unpaid promotion listing for free and stores its activation evidence. It never creates, completes, cancels, refunds or charges a payment.';
