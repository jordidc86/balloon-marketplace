-- Join public newsletter acquisition to the existing commercial journey.
-- The stored context is bounded and contains no raw visitor identifier, URL,
-- IP address, browser string or message content.

alter table public.newsletter_public_subscriptions
  add column if not exists source_context text not null default 'unknown',
  add column if not exists journey_key text,
  add column if not exists referrer_host text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;

alter table public.newsletter_public_subscriptions
  drop constraint if exists newsletter_public_subscriptions_source_context_check,
  drop constraint if exists newsletter_public_subscriptions_journey_key_check,
  drop constraint if exists newsletter_public_subscriptions_referrer_host_check,
  drop constraint if exists newsletter_public_subscriptions_utm_source_check,
  drop constraint if exists newsletter_public_subscriptions_utm_medium_check,
  drop constraint if exists newsletter_public_subscriptions_utm_campaign_check;

alter table public.newsletter_public_subscriptions
  add constraint newsletter_public_subscriptions_source_context_check
    check (source_context in ('home','catalog','unknown')),
  add constraint newsletter_public_subscriptions_journey_key_check
    check (journey_key is null or journey_key ~ '^[0-9a-f]{64}$'),
  add constraint newsletter_public_subscriptions_referrer_host_check
    check (referrer_host is null or char_length(referrer_host) <= 255),
  add constraint newsletter_public_subscriptions_utm_source_check
    check (utm_source is null or char_length(utm_source) <= 120),
  add constraint newsletter_public_subscriptions_utm_medium_check
    check (utm_medium is null or char_length(utm_medium) <= 120),
  add constraint newsletter_public_subscriptions_utm_campaign_check
    check (utm_campaign is null or char_length(utm_campaign) <= 120);

create index if not exists newsletter_public_subscriptions_source_requested_idx
  on public.newsletter_public_subscriptions (source_context, requested_at desc);
create index if not exists newsletter_public_subscriptions_journey_idx
  on public.newsletter_public_subscriptions (journey_key, requested_at desc)
  where journey_key is not null;

create or replace function public.begin_public_newsletter_optin(
  p_email text,
  p_email_hash text,
  p_request_key text,
  p_source_context text,
  p_journey_key text,
  p_referrer_host text,
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text
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
  if p_source_context not in ('home','catalog','unknown') then
    raise exception 'Invalid source context';
  end if;
  if p_journey_key is not null and p_journey_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid journey key';
  end if;
  if char_length(coalesce(p_referrer_host, '')) > 255
    or char_length(coalesce(p_utm_source, '')) > 120
    or char_length(coalesce(p_utm_medium, '')) > 120
    or char_length(coalesce(p_utm_campaign, '')) > 120 then
    raise exception 'Invalid acquisition context';
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
        unsubscribed_at = null,
        source_context = p_source_context,
        journey_key = p_journey_key,
        referrer_host = p_referrer_host,
        utm_source = p_utm_source,
        utm_medium = p_utm_medium,
        utm_campaign = p_utm_campaign
    where subscription.id = v_existing.id
    returning * into v_existing;
  else
    insert into public.newsletter_public_subscriptions (
      email, email_hash, status, confirmation_cycle, request_key, requested_at,
      source_context, journey_key, referrer_host, utm_source, utm_medium, utm_campaign
    ) values (
      p_email, p_email_hash, 'PENDING', 1, p_request_key, v_now,
      p_source_context, p_journey_key, p_referrer_host, p_utm_source, p_utm_medium, p_utm_campaign
    ) returning * into v_existing;
  end if;

  return query select v_existing.id, v_existing.email, v_existing.confirmation_cycle, true;
end;
$$;

revoke all on function public.begin_public_newsletter_optin(text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.begin_public_newsletter_optin(text, text, text, text, text, text, text, text, text) to service_role;

comment on column public.newsletter_public_subscriptions.source_context is
  'Closed public entry point. It contains no URL, form text or personal data.';
comment on column public.newsletter_public_subscriptions.journey_key is
  'Daily server-HMAC joining acquisition to later intent without a raw visitor identifier.';
comment on function public.begin_public_newsletter_optin(text, text, text) is
  'Backward-compatible service-only request claim for the previously deployed runtime. It preserves safe rollback and never activates consent.';
comment on function public.begin_public_newsletter_optin(text, text, text, text, text, text, text, text, text) is
  'Service-only public newsletter request claim with bounded, privacy-minimized acquisition context. It never activates consent.';
