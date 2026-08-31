-- Allow an interested marketplace visitor to request the existing newsletter
-- without creating an account. The request is private, rate-limited and
-- inactive until a provider-accepted confirmation email is followed by an
-- explicit signed POST. No existing account or contact is imported.

create table if not exists public.newsletter_public_subscriptions (
  id uuid default extensions.uuid_generate_v4() primary key,
  email text not null check (char_length(email) between 3 and 320 and email = lower(trim(email))),
  email_hash text not null unique check (email_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'PENDING' check (status in ('PENDING','ACTIVE','UNSUBSCRIBED')),
  confirmation_cycle integer not null default 1 check (confirmation_cycle between 1 and 1000000),
  request_key text check (request_key is null or request_key ~ '^[0-9a-f]{64}$'),
  requested_at timestamp with time zone not null default timezone('utc'::text, now()),
  confirmed_at timestamp with time zone,
  unsubscribed_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint newsletter_public_subscription_state_check check (
    (status = 'PENDING' and confirmed_at is null and unsubscribed_at is null)
    or (status = 'ACTIVE' and confirmed_at is not null and unsubscribed_at is null)
    or (status = 'UNSUBSCRIBED' and unsubscribed_at is not null)
  )
);

create index if not exists newsletter_public_subscriptions_status_idx
  on public.newsletter_public_subscriptions (status, confirmed_at desc);
create index if not exists newsletter_public_subscriptions_request_rate_idx
  on public.newsletter_public_subscriptions (request_key, requested_at desc)
  where request_key is not null;

drop trigger if exists set_newsletter_public_subscriptions_updated_at on public.newsletter_public_subscriptions;
create trigger set_newsletter_public_subscriptions_updated_at
  before update on public.newsletter_public_subscriptions
  for each row execute procedure public.set_updated_at();

alter table public.newsletter_public_subscriptions enable row level security;
revoke all on public.newsletter_public_subscriptions from public, anon, authenticated;
grant select on public.newsletter_public_subscriptions to authenticated;

drop policy if exists "Admins can inspect public newsletter consent" on public.newsletter_public_subscriptions;
create policy "Admins can inspect public newsletter consent"
  on public.newsletter_public_subscriptions for select to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

alter table public.commercial_notification_receipts
  drop constraint if exists commercial_notification_receipts_notification_type_check,
  drop constraint if exists commercial_notification_receipts_entity_type_check;

alter table public.commercial_notification_receipts
  add constraint commercial_notification_receipts_notification_type_check check (notification_type in (
    'listing_created_admin','quote_created_admin','wanted_request_admin','listing_quality_quarantine','inquiry_buyer_ack',
    'inquiry_seller_followup','inquiry_seller_escalation','inquiry_buyer_seller_response','inquiry_seller_buyer_response','quote_admin_followup','premium_listing_checkout_recovery',
    'wanted_match_buyer','listing_verification_requested','listing_verification_decision','seller_assistance_created_admin',
    'seller_assistance_admin_followup','new_balloon_proposal_buyer','new_balloon_buyer_ack','listing_watch_confirmation','listing_watch_update',
    'listing_availability_request','new_balloon_proposal_response_admin','new_balloon_proposal_response_followup',
    'buyer_early_access_checkout_recovery','seller_availability_digest','newsletter_consent_invitation','account_password_recovery',
    'newsletter_public_optin_confirmation'
  )),
  add constraint commercial_notification_receipts_entity_type_check check (entity_type in (
    'listing','quote_request','wanted_request','inquiry','seller_assistance','quote_proposal','listing_watch','premium_checkout_intent','user','newsletter_subscription'
  ));

create or replace function public.begin_public_newsletter_optin(
  p_email text,
  p_email_hash text,
  p_request_key text
)
returns table(subscription_id uuid, normalized_email text, confirmation_cycle integer, should_send boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.newsletter_public_subscriptions%rowtype;
  v_now timestamp with time zone := timezone('utc'::text, now());
  v_recent_count integer;
  v_exists boolean := false;
begin
  if p_email is null or p_email <> lower(trim(p_email)) or char_length(p_email) < 3 or char_length(p_email) > 320 then
    raise exception 'Invalid normalized email';
  end if;
  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid email hash';
  end if;
  if p_request_key is null or p_request_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid request key';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_email_hash, 0));
  select * into v_existing
  from public.newsletter_public_subscriptions subscription
  where subscription.email_hash = p_email_hash
  for update;
  v_exists := found;

  if v_exists and v_existing.status = 'ACTIVE' then
    return query select v_existing.id, v_existing.email, v_existing.confirmation_cycle, false;
    return;
  end if;

  if v_exists and v_existing.status = 'PENDING' and v_existing.requested_at > v_now - interval '24 hours' then
    return query select v_existing.id, v_existing.email, v_existing.confirmation_cycle, false;
    return;
  end if;

  select count(*)::integer into v_recent_count
  from public.newsletter_public_subscriptions subscription
  where subscription.request_key = p_request_key
    and subscription.requested_at >= v_now - interval '1 hour';
  if v_recent_count >= 5 then
    raise exception 'Public newsletter request rate exceeded' using errcode = 'P0001';
  end if;

  if v_exists then
    update public.newsletter_public_subscriptions subscription
    set email = p_email,
        status = 'PENDING',
        confirmation_cycle = subscription.confirmation_cycle + 1,
        request_key = p_request_key,
        requested_at = v_now,
        confirmed_at = null,
        unsubscribed_at = null
    where subscription.id = v_existing.id
    returning * into v_existing;
  else
    insert into public.newsletter_public_subscriptions (
      email, email_hash, status, confirmation_cycle, request_key, requested_at
    ) values (
      p_email, p_email_hash, 'PENDING', 1, p_request_key, v_now
    ) returning * into v_existing;
  end if;

  return query select v_existing.id, v_existing.email, v_existing.confirmation_cycle, true;
end;
$$;

create or replace function public.confirm_public_newsletter_optin(
  p_subscription_id uuid,
  p_confirmation_cycle integer,
  p_receipt_key text
)
returns table(subscription_id uuid, subscription_status text, confirmed_at timestamp with time zone)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subscription public.newsletter_public_subscriptions%rowtype;
  v_receipt public.commercial_notification_receipts%rowtype;
  v_now timestamp with time zone := timezone('utc'::text, now());
begin
  if p_subscription_id is null or p_confirmation_cycle < 1 or p_confirmation_cycle > 1000000 then
    raise exception 'Invalid confirmation scope';
  end if;
  if p_receipt_key <> 'newsletter-public-optin-v1-' || lower(p_subscription_id::text) || '-' || p_confirmation_cycle::text then
    raise exception 'Invalid confirmation receipt key';
  end if;

  select * into v_subscription
  from public.newsletter_public_subscriptions subscription
  where subscription.id = p_subscription_id
  for update;
  if not found or v_subscription.confirmation_cycle <> p_confirmation_cycle then
    raise exception 'Newsletter confirmation is stale';
  end if;
  if v_subscription.status = 'ACTIVE' and v_subscription.confirmed_at is not null then
    return query select v_subscription.id, v_subscription.status, v_subscription.confirmed_at;
    return;
  end if;
  if v_subscription.status <> 'PENDING' then
    raise exception 'Newsletter confirmation is not pending';
  end if;

  select * into v_receipt
  from public.commercial_notification_receipts receipt
  where receipt.notification_type = 'newsletter_public_optin_confirmation'
    and receipt.entity_type = 'newsletter_subscription'
    and receipt.entity_id = p_subscription_id
    and receipt.idempotency_key = p_receipt_key
    and receipt.status = 'accepted'
    and receipt.provider_message_id is not null
  for update;
  if not found then
    raise exception 'Accepted newsletter confirmation delivery is required';
  end if;

  update public.newsletter_public_subscriptions subscription
  set status = 'ACTIVE', confirmed_at = v_now, unsubscribed_at = null
  where subscription.id = p_subscription_id
  returning * into v_subscription;

  update public.commercial_notification_receipts receipt
  set consumed_at = coalesce(receipt.consumed_at, v_now)
  where receipt.id = v_receipt.id;

  return query select v_subscription.id, v_subscription.status, v_subscription.confirmed_at;
end;
$$;

create or replace function public.unsubscribe_public_newsletter(p_subscription_id uuid)
returns table(subscription_id uuid, subscription_status text, unsubscribed_at timestamp with time zone)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subscription public.newsletter_public_subscriptions%rowtype;
  v_now timestamp with time zone := timezone('utc'::text, now());
begin
  select * into v_subscription
  from public.newsletter_public_subscriptions subscription
  where subscription.id = p_subscription_id
  for update;
  if not found then raise exception 'Newsletter subscription not found'; end if;

  if v_subscription.status <> 'UNSUBSCRIBED' or v_subscription.unsubscribed_at is null then
    update public.newsletter_public_subscriptions subscription
    set status = 'UNSUBSCRIBED', unsubscribed_at = v_now
    where subscription.id = p_subscription_id
    returning * into v_subscription;
  end if;

  return query select v_subscription.id, v_subscription.status, v_subscription.unsubscribed_at;
end;
$$;

revoke all on function public.begin_public_newsletter_optin(text, text, text) from public, anon, authenticated;
revoke all on function public.confirm_public_newsletter_optin(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.unsubscribe_public_newsletter(uuid) from public, anon, authenticated;
grant execute on function public.begin_public_newsletter_optin(text, text, text) to service_role;
grant execute on function public.confirm_public_newsletter_optin(uuid, integer, text) to service_role;
grant execute on function public.unsubscribe_public_newsletter(uuid) to service_role;

comment on table public.newsletter_public_subscriptions is
  'Private double-opt-in newsletter preferences for visitors without an AeroTrade account. No row is active until accepted provider delivery and explicit signed POST confirmation.';
comment on column public.newsletter_public_subscriptions.email_hash is
  'Server-HMAC email lookup key; not a raw email duplicate and never exposed publicly.';
comment on column public.newsletter_public_subscriptions.request_key is
  'One-way abuse-control key containing no raw IP address or browser identifier.';
comment on function public.begin_public_newsletter_optin(text, text, text) is
  'Service-only, serialized and rate-limited public newsletter request claim. It never activates consent.';
comment on function public.confirm_public_newsletter_optin(uuid, integer, text) is
  'Service-only explicit confirmation. Requires the exact provider-accepted delivery receipt and consumes that capability atomically.';
comment on function public.unsubscribe_public_newsletter(uuid) is
  'Service-only idempotent stop action invoked only after server-side signed capability verification.';
