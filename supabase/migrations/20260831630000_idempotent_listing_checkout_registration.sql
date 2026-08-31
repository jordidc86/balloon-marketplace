create or replace function public.register_listing_checkout_intent(
  p_listing_id uuid,
  p_user_id uuid,
  p_stripe_session_id text,
  p_source text
)
returns public.listing_checkout_intents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings%rowtype;
  v_intent public.listing_checkout_intents%rowtype;
begin
  if p_stripe_session_id is null or p_stripe_session_id !~ '^cs_(test|live)_[A-Za-z0-9]+$' then
    raise exception 'A valid Stripe checkout session is required';
  end if;
  if p_source not in ('initial', 'dashboard', 'catalog') then
    raise exception 'Invalid listing checkout source';
  end if;

  select * into v_listing
  from public.listings
  where id = p_listing_id
  for update;

  if not found
    or v_listing.seller_id <> p_user_id
    or v_listing.status not in ('DRAFT', 'PENDING_PAYMENT')
    or coalesce(v_listing.details->>'listing_plan', '') <> 'premium'
  then
    raise exception 'Listing is not eligible for Seller Launch Promotion checkout';
  end if;

  select * into v_intent
  from public.listing_checkout_intents
  where stripe_session_id = p_stripe_session_id;

  if found then
    if v_intent.listing_id <> p_listing_id
      or v_intent.user_id <> p_user_id
      or v_intent.status <> 'STARTED'
    then
      raise exception 'Stripe checkout session is already bound to another or terminal intent';
    end if;
    return v_intent;
  end if;

  update public.listing_checkout_intents
  set status = 'SUPERSEDED', updated_at = timezone('utc'::text, now())
  where listing_id = p_listing_id and status = 'STARTED';

  insert into public.listing_checkout_intents (
    listing_id, user_id, stripe_session_id, source
  ) values (
    p_listing_id, p_user_id, p_stripe_session_id, p_source
  )
  returning * into v_intent;

  return v_intent;
end;
$$;

revoke all on function public.register_listing_checkout_intent(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.register_listing_checkout_intent(uuid, uuid, text, text) to service_role;
