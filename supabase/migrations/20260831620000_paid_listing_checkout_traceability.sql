create table if not exists public.listing_checkout_intents (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_session_id text not null unique,
  source text not null check (source in ('initial', 'dashboard', 'catalog', 'historical')),
  status text not null default 'STARTED' check (status in ('STARTED', 'COMPLETED', 'EXPIRED', 'SUPERSEDED')),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  completed_at timestamp with time zone
);

create unique index if not exists listing_checkout_intents_one_live_per_listing
  on public.listing_checkout_intents (listing_id)
  where status = 'STARTED';

create index if not exists listing_checkout_intents_user_created_idx
  on public.listing_checkout_intents (user_id, created_at desc);

alter table public.listing_checkout_intents enable row level security;
revoke all on public.listing_checkout_intents from anon, authenticated;

comment on table public.listing_checkout_intents is
  'Private ledger linking each Seller Launch Promotion checkout to one seller and listing. No card data or checkout URL is stored.';

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

alter table public.payment_notification_receipts
  add column if not exists stripe_checkout_session_id text,
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists listing_id uuid references public.listings(id) on delete set null;

create index if not exists payment_notification_receipts_user_idx
  on public.payment_notification_receipts (user_id, accepted_at desc)
  where user_id is not null;

create index if not exists payment_notification_receipts_listing_idx
  on public.payment_notification_receipts (listing_id, accepted_at desc)
  where listing_id is not null;

comment on column public.payment_notification_receipts.stripe_checkout_session_id is
  'Stripe Checkout session resolved from signed provider evidence when available.';
comment on column public.payment_notification_receipts.user_id is
  'AeroTrade account that received the paid entitlement, when provider metadata resolves it safely.';
comment on column public.payment_notification_receipts.listing_id is
  'AeroTrade listing that received Seller Launch Promotion, when provider metadata resolves it safely.';

