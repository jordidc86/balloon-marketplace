-- AeroTrade/Voyager shared public-schema recovery baseline.
-- Captured read-only from production after migration 20260829480000.
-- Schema only: this file contains no table rows, credentials or environment values.
-- Do not apply this file to the linked production database. It is consumed only
-- by scripts/rehearse-database-recovery.mjs inside a disposable local database.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."accept_new_balloon_proposal_delivery"("p_proposal_id" "uuid", "p_provider_message_id" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_actor uuid := auth.uid(); v_quote_id uuid; v_status text; v_now timestamptz := timezone('utc'::text, now());
begin
  if v_actor is null or not exists (select 1 from public.users where id=v_actor and role='admin') then raise exception 'Not authorized'; end if;
  if p_provider_message_id is null or char_length(btrim(p_provider_message_id)) not between 3 and 200 then raise exception 'Invalid provider message id'; end if;
  select quote_request_id, delivery_status into v_quote_id, v_status from public.new_balloon_quote_proposals where id=p_proposal_id for update;
  if not found then raise exception 'Proposal not found'; end if;
  if v_status = 'accepted' then return p_proposal_id; end if;
  update public.new_balloon_quote_proposals set delivery_status='accepted', provider_message_id=btrim(p_provider_message_id), delivery_error=null, accepted_at=v_now where id=p_proposal_id;
  update public.quote_requests set status='QUOTE_SENT', updated_at=v_now where id=v_quote_id and status not in ('WON','LOST');
  if not found then raise exception 'Quote request is already closed'; end if;
  return p_proposal_id;
end; $$;


ALTER FUNCTION "public"."accept_new_balloon_proposal_delivery"("p_proposal_id" "uuid", "p_provider_message_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_listing_by_actor"("p_listing_id" "uuid", "p_action" "text", "p_sale_channel" "text" DEFAULT NULL::"text", "p_marketplace_inquiry_id" "uuid" DEFAULT NULL::"uuid", "p_gross_amount_minor" bigint DEFAULT NULL::bigint, "p_currency" "text" DEFAULT NULL::"text") RETURNS TABLE("event_id" "uuid", "listing_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_listing public.listings%rowtype;
  v_action text := upper(nullif(btrim(p_action), ''));
  v_channel text := upper(nullif(btrim(p_sale_channel), ''));
  v_currency text := upper(nullif(btrim(p_currency), ''));
  v_target_status text;
  v_event_id uuid;
  v_existing_status text;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  select exists (select 1 from public.users where id = v_actor and role = 'admin') into v_is_admin;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if v_listing.id is null or (v_listing.seller_id <> v_actor and not v_is_admin) then
    raise exception 'Listing not found';
  end if;
  if v_listing.status not in ('DRAFT', 'PENDING_PAYMENT', 'ACTIVE_PREMIUM', 'ACTIVE_PUBLIC') then
    select id, new_status into v_event_id, v_existing_status from public.listing_lifecycle_events where listing_id = p_listing_id;
    if v_event_id is not null and ((v_action = 'SOLD' and v_existing_status = 'SOLD') or (v_action = 'WITHDRAWN' and v_existing_status = 'ARCHIVED')) then
      return query select v_event_id, v_existing_status;
      return;
    end if;
    raise exception 'Listing is already closed or cannot be closed';
  end if;

  if v_action = 'WITHDRAWN' then
    if v_channel is not null or p_marketplace_inquiry_id is not null or p_gross_amount_minor is not null or v_currency is not null then
      raise exception 'A withdrawal cannot contain sale evidence';
    end if;
    v_target_status := 'ARCHIVED';
  elsif v_action = 'SOLD' then
    if v_channel not in ('AEROTRADE', 'OTHER_CHANNEL', 'NOT_DISCLOSED') then raise exception 'Invalid sale channel'; end if;
    if v_channel = 'AEROTRADE' then
      if p_marketplace_inquiry_id is null or not exists (
        select 1 from public.marketplace_inquiries
        where id = p_marketplace_inquiry_id and listing_id = p_listing_id and status <> 'SPAM'
      ) then raise exception 'AeroTrade sale requires a matching non-spam enquiry'; end if;
    elsif p_marketplace_inquiry_id is not null then
      raise exception 'Only an AeroTrade sale can reference an AeroTrade enquiry';
    end if;
    if (p_gross_amount_minor is null) <> (v_currency is null) then raise exception 'Sale amount and currency must be provided together'; end if;
    if p_gross_amount_minor is not null and (p_gross_amount_minor <= 0 or v_currency <> v_listing.currency or v_currency not in ('EUR', 'GBP', 'USD')) then
      raise exception 'Invalid sale amount or currency';
    end if;
    v_target_status := 'SOLD';
  else
    raise exception 'Invalid listing closure action';
  end if;

  insert into public.listing_lifecycle_events (
    listing_id, seller_id, recorded_by, actor_role, event_type, sale_channel,
    marketplace_inquiry_id, gross_amount_minor, currency, previous_status, new_status
  ) values (
    v_listing.id, v_listing.seller_id, v_actor, case when v_is_admin then 'ADMIN' else 'SELLER' end,
    v_action, v_channel, p_marketplace_inquiry_id, p_gross_amount_minor, v_currency,
    v_listing.status, v_target_status
  ) returning id into v_event_id;

  update public.listings set status = v_target_status where id = v_listing.id;
  if not found then raise exception 'Listing closure could not be persisted'; end if;

  return query select v_event_id, v_target_status;
end;
$$;


ALTER FUNCTION "public"."close_listing_by_actor"("p_listing_id" "uuid", "p_action" "text", "p_sale_channel" "text", "p_marketplace_inquiry_id" "uuid", "p_gross_amount_minor" bigint, "p_currency" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."close_listing_by_actor"("p_listing_id" "uuid", "p_action" "text", "p_sale_channel" "text", "p_marketplace_inquiry_id" "uuid", "p_gross_amount_minor" bigint, "p_currency" "text") IS 'Atomically closes an owner listing with immutable seller/admin attribution. A seller report never creates revenue or changes an enquiry outcome.';



CREATE OR REPLACE FUNCTION "public"."confirm_listing_availability"("p_listing_id" "uuid") RETURNS TABLE("confirmation_id" "uuid", "confirmed_at" timestamp with time zone, "confirmed_on" "date")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_listing public.listings%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_listing
  from public.listings
  where id = p_listing_id
  for update;

  if v_listing.id is null or v_listing.seller_id <> v_user_id then
    raise exception 'Listing not found';
  end if;

  if v_listing.status not in ('ACTIVE_PUBLIC', 'ACTIVE_PREMIUM') then
    raise exception 'Only active listings can be confirmed available';
  end if;

  insert into public.listing_availability_confirmations (
    listing_id,
    seller_id,
    listing_status,
    source,
    confirmed_on
  ) values (
    v_listing.id,
    v_user_id,
    v_listing.status,
    'SELLER_DASHBOARD',
    current_date
  )
  on conflict (listing_id, confirmed_on) do nothing;

  return query
  select c.id, c.confirmed_at, c.confirmed_on
  from public.listing_availability_confirmations c
  where c.listing_id = p_listing_id
    and c.confirmed_on = current_date
    and c.seller_id = v_user_id;
end;
$$;


ALTER FUNCTION "public"."confirm_listing_availability"("p_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_listing_watch_by_service"("p_watcher_id" "uuid") RETURNS TABLE("outcome" "text", "watcher_status" "text", "confirmed_at" timestamp with time zone, "closed_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_watcher_id uuid;
  v_watcher_status text;
  v_confirmed_at timestamp with time zone;
  v_closed_at timestamp with time zone;
  v_listing_status text;
  v_now timestamp with time zone := timezone('utc'::text, now());
begin
  select watcher.id, watcher.status, watcher.confirmed_at, watcher.closed_at, listing.status
  into v_watcher_id, v_watcher_status, v_confirmed_at, v_closed_at, v_listing_status
  from public.listing_watchers as watcher
  join public.listings as listing on listing.id = watcher.listing_id
  where watcher.id = p_watcher_id
  for update of watcher, listing;

  if v_watcher_id is null then raise exception 'Listing watch not found'; end if;

  if v_watcher_status = 'ACTIVE' then
    return query select 'ALREADY_ACTIVE'::text, v_watcher_status, v_confirmed_at, v_closed_at;
    return;
  end if;
  if v_watcher_status = 'LISTING_CLOSED' then
    return query select 'LISTING_CLOSED'::text, v_watcher_status, v_confirmed_at, v_closed_at;
    return;
  end if;
  if v_watcher_status <> 'PENDING_CONFIRMATION' then
    return query select 'NOT_CONFIRMABLE'::text, v_watcher_status, v_confirmed_at, v_closed_at;
    return;
  end if;

  if v_listing_status in ('SOLD', 'ARCHIVED') then
    update public.listing_watchers
    set status = 'LISTING_CLOSED', closed_at = v_now
    where id = v_watcher_id and status = 'PENDING_CONFIRMATION'
    returning listing_watchers.status, listing_watchers.confirmed_at, listing_watchers.closed_at
    into v_watcher_status, v_confirmed_at, v_closed_at;
    if not found then raise exception 'Listing watch closure did not persist'; end if;
    return query select 'LISTING_CLOSED'::text, v_watcher_status, v_confirmed_at, v_closed_at;
    return;
  end if;

  update public.listing_watchers
  set status = 'ACTIVE', confirmed_at = v_now, unsubscribed_at = null, closed_at = null
  where id = v_watcher_id and status = 'PENDING_CONFIRMATION'
  returning listing_watchers.status, listing_watchers.confirmed_at, listing_watchers.closed_at
  into v_watcher_status, v_confirmed_at, v_closed_at;
  if not found then raise exception 'Listing watch activation did not persist'; end if;

  return query select 'ACTIVATED'::text, v_watcher_status, v_confirmed_at, v_closed_at;
end;
$$;


ALTER FUNCTION "public"."confirm_listing_watch_by_service"("p_watcher_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."confirm_listing_watch_by_service"("p_watcher_id" "uuid") IS 'Atomically confirms one token-verified watch through the service role, or retires it when its listing is already SOLD or ARCHIVED.';



CREATE OR REPLACE FUNCTION "public"."decide_listing_verification"("p_listing_id" "uuid", "p_admin" "uuid", "p_action" "text", "p_identity_review_basis" "text" DEFAULT NULL::"text", "p_supporting_evidence_types" "text"[] DEFAULT '{}'::"text"[], "p_decision_reason" "text" DEFAULT NULL::"text", "p_review_scope_acknowledged" boolean DEFAULT false) RETURNS TABLE("event_id" "uuid", "verification_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_status text;
  next_status text;
  next_event_type text;
  new_event_id uuid;
begin
  if not exists (select 1 from public.users where id = p_admin and role = 'admin') then
    raise exception 'Administrator authorization is required';
  end if;

  select status into current_status
  from public.listing_verifications
  where listing_id = p_listing_id
  for update;

  if p_action in ('verify', 'reject') and current_status is distinct from 'IN_REVIEW' then
    raise exception 'Only queued verification requests can be decided';
  end if;
  if p_action = 'unverify' and current_status is distinct from 'VERIFIED' then
    raise exception 'Only verified listings can be unverified';
  end if;
  if p_action not in ('verify', 'reject', 'unverify') then
    raise exception 'Invalid verification action';
  end if;

  next_status := case p_action
    when 'verify' then 'VERIFIED'
    when 'reject' then 'REJECTED'
    else 'UNVERIFIED'
  end;
  next_event_type := case p_action
    when 'verify' then 'VERIFIED'
    when 'reject' then 'REJECTED'
    else 'UNVERIFIED'
  end;

  update public.listing_verifications set
    status = next_status,
    identity_checked = (p_action = 'verify'),
    supporting_documents_checked = (p_action = 'verify'),
    identity_review_basis = case when p_action = 'verify' then p_identity_review_basis else null end,
    supporting_evidence_types = case when p_action = 'verify' then p_supporting_evidence_types else '{}'::text[] end,
    decision_reason = case when p_action = 'verify' then null else p_decision_reason end,
    review_scope_acknowledged = (p_action = 'verify' and p_review_scope_acknowledged),
    verified_by = case when p_action = 'verify' then p_admin else null end,
    verified_at = case when p_action = 'verify' then timezone('utc'::text, now()) else null end,
    last_decided_at = timezone('utc'::text, now())
  where listing_id = p_listing_id;

  insert into public.listing_verification_events (
    listing_id, actor_user_id, event_type, from_status, to_status,
    identity_review_basis, supporting_evidence_types, decision_reason
  ) values (
    p_listing_id, p_admin, next_event_type, current_status, next_status,
    case when p_action = 'verify' then p_identity_review_basis else null end,
    case when p_action = 'verify' then p_supporting_evidence_types else '{}'::text[] end,
    case when p_action = 'verify' then null else p_decision_reason end
  ) returning id into new_event_id;

  return query select new_event_id, next_status;
end;
$$;


ALTER FUNCTION "public"."decide_listing_verification"("p_listing_id" "uuid", "p_admin" "uuid", "p_action" "text", "p_identity_review_basis" "text", "p_supporting_evidence_types" "text"[], "p_decision_reason" "text", "p_review_scope_acknowledged" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."decide_listing_verification"("p_listing_id" "uuid", "p_admin" "uuid", "p_action" "text", "p_identity_review_basis" "text", "p_supporting_evidence_types" "text"[], "p_decision_reason" "text", "p_review_scope_acknowledged" boolean) IS 'Atomically decides one queued review and appends closed-category audit evidence; stores no document copy.';



CREATE OR REPLACE FUNCTION "public"."enforce_commercial_outcome_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_entity_type text := case when tg_table_name = 'marketplace_inquiries' then 'marketplace_inquiry' else 'quote_request' end;
  v_has_outcome boolean;
begin
  if new.status is not distinct from old.status then return new; end if;

  select exists (
    select 1 from public.commercial_outcomes
    where entity_type = v_entity_type and entity_id = new.id
  ) into v_has_outcome;

  if new.status = 'WON' and not v_has_outcome then
    raise exception 'WON status requires an atomic commercial outcome';
  end if;
  if new.status <> 'WON' and v_has_outcome then
    raise exception 'An opportunity with a commercial outcome must remain WON';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_commercial_outcome_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.users (id, email, name, phone)
  VALUES (
    NEW.id, 
    NEW.email, 
    NEW.raw_user_meta_data->>'name', 
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO UPDATE 
  SET 
    name = EXCLUDED.name,
    phone = EXCLUDED.phone;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_buyer_inquiry_response"("p_inquiry_id" "uuid", "p_responding_to_event_id" "uuid", "p_buyer_email" "text", "p_response" "text", "p_amount_minor" bigint DEFAULT NULL::bigint, "p_note" "text" DEFAULT NULL::"text") RETURNS TABLE("event_id" "uuid", "inquiry_status" "text", "notification_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_currency text;
  v_current_status text;
  v_buyer_user_id uuid;
  v_event_type text;
  v_target_status text;
  v_event_id uuid;
  v_notification_status text;
  v_latest_event_id uuid;
  v_target_event_type text;
begin
  if p_response not in ('ACCEPT','COUNTER','DECLINE') then raise exception 'Invalid response'; end if;
  if p_response = 'COUNTER' and (p_amount_minor is null or p_amount_minor <= 0) then
    raise exception 'A positive counteroffer amount is required';
  end if;
  if p_response <> 'COUNTER' and p_amount_minor is not null then
    raise exception 'Amount is only allowed for a counteroffer';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then raise exception 'Response note is too long'; end if;

  select inquiry.currency, inquiry.status, inquiry.buyer_user_id
  into v_currency, v_current_status, v_buyer_user_id
  from public.marketplace_inquiries as inquiry
  where inquiry.id = p_inquiry_id
    and lower(trim(inquiry.buyer_email)) = lower(trim(p_buyer_email))
  for update of inquiry;

  if v_currency is null then raise exception 'Enquiry not found or buyer identity does not match'; end if;

  select event.id, event.seller_notification_status
  into v_event_id, v_notification_status
  from public.marketplace_inquiry_offer_events as event
  where event.inquiry_id = p_inquiry_id
    and event.responding_to_event_id = p_responding_to_event_id
  limit 1;

  if v_event_id is not null then
    return query select v_event_id, v_current_status, v_notification_status;
    return;
  end if;

  if v_current_status in ('WON','LOST','SPAM') then raise exception 'This enquiry is already closed'; end if;

  select event.event_type
  into v_target_event_type
  from public.marketplace_inquiry_offer_events as event
  where event.id = p_responding_to_event_id
    and event.inquiry_id = p_inquiry_id
    and event.event_type in ('SELLER_ACCEPTED_FOR_NEGOTIATION','SELLER_COUNTERED');
  if v_target_event_type is null then raise exception 'Seller response not found or cannot be answered'; end if;

  select event.id into v_latest_event_id
  from public.marketplace_inquiry_offer_events as event
  where event.inquiry_id = p_inquiry_id
  order by event.created_at desc, event.id desc
  limit 1;
  if v_latest_event_id is distinct from p_responding_to_event_id then raise exception 'This negotiation link is no longer current'; end if;

  v_event_type := case p_response
    when 'ACCEPT' then 'BUYER_ACCEPTED_FOR_NEGOTIATION'
    when 'COUNTER' then 'BUYER_COUNTERED'
    else 'BUYER_DECLINED'
  end;
  v_target_status := case when p_response = 'DECLINE' then 'LOST' else 'NEGOTIATING' end;

  insert into public.marketplace_inquiry_offer_events (
    inquiry_id, event_type, actor_role, actor_user_id, amount_minor, currency, note,
    buyer_notification_status, seller_notification_status, responding_to_event_id, idempotency_key
  ) values (
    p_inquiry_id, v_event_type, 'BUYER', v_buyer_user_id, p_amount_minor, v_currency,
    nullif(trim(p_note), ''), 'not_required', 'pending', p_responding_to_event_id,
    'buyer-response:' || p_responding_to_event_id::text
  ) returning id, seller_notification_status into v_event_id, v_notification_status;

  update public.marketplace_inquiries
  set status = v_target_status,
      last_activity_at = timezone('utc'::text, now()),
      closed_at = case when v_target_status = 'LOST' then timezone('utc'::text, now()) else null end
  where id = p_inquiry_id;

  return query select v_event_id, v_target_status, v_notification_status;
end;
$$;


ALTER FUNCTION "public"."record_buyer_inquiry_response"("p_inquiry_id" "uuid", "p_responding_to_event_id" "uuid", "p_buyer_email" "text", "p_response" "text", "p_amount_minor" bigint, "p_note" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."record_buyer_inquiry_response"("p_inquiry_id" "uuid", "p_responding_to_event_id" "uuid", "p_buyer_email" "text", "p_response" "text", "p_amount_minor" bigint, "p_note" "text") IS 'Service-only atomic buyer response to one current seller negotiation event. Authorization is verified by the application capability before calling.';



CREATE OR REPLACE FUNCTION "public"."record_commercial_outcome"("p_entity_type" "text", "p_entity_id" "uuid", "p_outcome_type" "text", "p_currency" "text", "p_gross_amount_minor" bigint, "p_aerotrade_revenue_minor" bigint, "p_evidence_level" "text", "p_evidence_source" "text", "p_evidence_reference" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_current_status text;
  v_outcome_id uuid;
  v_event_type text;
  v_previous_evidence_level text;
  v_now timestamp with time zone := timezone('utc'::text, now());
  v_reference text := nullif(btrim(p_evidence_reference), '');
  v_notes text := nullif(btrim(p_notes), '');
begin
  if v_actor is null or not exists (
    select 1 from public.users where id = v_actor and role = 'admin'
  ) then
    raise exception 'Not authorized';
  end if;

  if p_entity_type not in ('marketplace_inquiry', 'quote_request') then raise exception 'Invalid entity type'; end if;
  if p_outcome_type not in ('sale', 'intermediation', 'other') then raise exception 'Invalid outcome type'; end if;
  if p_currency not in ('EUR', 'GBP', 'USD') then raise exception 'Invalid currency'; end if;
  if p_gross_amount_minor < 0 or p_aerotrade_revenue_minor < 0 or p_aerotrade_revenue_minor > p_gross_amount_minor then
    raise exception 'Invalid outcome amounts';
  end if;
  if p_outcome_type in ('sale', 'intermediation') and p_gross_amount_minor = 0 then
    raise exception 'A sale or intermediation outcome requires a positive gross amount';
  end if;
  if p_evidence_level not in ('reported', 'documented', 'settled') then raise exception 'Invalid evidence level'; end if;
  if p_evidence_source not in ('operator_report', 'contract', 'invoice', 'bank_transfer', 'stripe_payment', 'other_document') then
    raise exception 'Invalid evidence source';
  end if;
  if v_reference is not null and char_length(v_reference) not between 3 and 200 then raise exception 'Invalid evidence reference'; end if;
  if v_notes is not null and char_length(v_notes) > 2000 then raise exception 'Outcome notes are too long'; end if;
  if p_evidence_level = 'reported' and p_evidence_source <> 'operator_report' then
    raise exception 'Reported outcomes must use operator report evidence';
  end if;
  if p_evidence_level = 'documented' and (p_evidence_source = 'operator_report' or v_reference is null) then
    raise exception 'Documented outcomes require a document source and reference';
  end if;
  if p_evidence_level = 'settled' and (p_evidence_source not in ('bank_transfer', 'stripe_payment') or v_reference is null) then
    raise exception 'Settled revenue requires a bank or Stripe reference';
  end if;

  if p_entity_type = 'marketplace_inquiry' then
    select status into v_current_status
    from public.marketplace_inquiries
    where id = p_entity_id
    for update;
    if not found then raise exception 'Commercial opportunity not found'; end if;
    if v_current_status in ('LOST', 'SPAM') then raise exception 'A closed unsuccessful enquiry cannot be recorded as won'; end if;
  else
    select status into v_current_status
    from public.quote_requests
    where id = p_entity_id
    for update;
    if not found then raise exception 'Commercial opportunity not found'; end if;
    if v_current_status = 'LOST' then raise exception 'A lost quote cannot be recorded as won'; end if;
  end if;

  select id, evidence_level into v_outcome_id, v_previous_evidence_level
  from public.commercial_outcomes
  where entity_type = p_entity_type and entity_id = p_entity_id;
  v_event_type := case when v_outcome_id is null then 'OUTCOME_RECORDED' else 'OUTCOME_UPDATED' end;
  if v_previous_evidence_level is not null and
    array_position(array['reported', 'documented', 'settled'], p_evidence_level)
      < array_position(array['reported', 'documented', 'settled'], v_previous_evidence_level) then
    raise exception 'Outcome evidence cannot be downgraded';
  end if;

  insert into public.commercial_outcomes (
    entity_type, entity_id, outcome_type, currency, gross_amount_minor,
    aerotrade_revenue_minor, evidence_level, evidence_source,
    evidence_reference, notes, recorded_by, closed_at, settled_at
  ) values (
    p_entity_type, p_entity_id, p_outcome_type, p_currency, p_gross_amount_minor,
    p_aerotrade_revenue_minor, p_evidence_level, p_evidence_source,
    v_reference, v_notes, v_actor, v_now,
    case when p_evidence_level = 'settled' then v_now else null end
  )
  on conflict (entity_type, entity_id) do update set
    outcome_type = excluded.outcome_type,
    currency = excluded.currency,
    gross_amount_minor = excluded.gross_amount_minor,
    aerotrade_revenue_minor = excluded.aerotrade_revenue_minor,
    evidence_level = excluded.evidence_level,
    evidence_source = excluded.evidence_source,
    evidence_reference = excluded.evidence_reference,
    notes = excluded.notes,
    recorded_by = excluded.recorded_by,
    closed_at = public.commercial_outcomes.closed_at,
    settled_at = case
      when excluded.evidence_level = 'settled' then coalesce(public.commercial_outcomes.settled_at, excluded.settled_at)
      else null
    end
  returning id into v_outcome_id;

  insert into public.commercial_outcome_events (
    outcome_id, entity_type, entity_id, event_type, outcome_type, currency,
    gross_amount_minor, aerotrade_revenue_minor, evidence_level,
    evidence_source, evidence_reference, notes, recorded_by
  ) values (
    v_outcome_id, p_entity_type, p_entity_id, v_event_type, p_outcome_type, p_currency,
    p_gross_amount_minor, p_aerotrade_revenue_minor, p_evidence_level,
    p_evidence_source, v_reference, v_notes, v_actor
  );

  if p_entity_type = 'marketplace_inquiry' then
    update public.marketplace_inquiries
    set status = 'WON', last_activity_at = v_now, closed_at = v_now
    where id = p_entity_id;
  else
    update public.quote_requests
    set status = 'WON', updated_at = v_now
    where id = p_entity_id;
  end if;

  return v_outcome_id;
end;
$$;


ALTER FUNCTION "public"."record_commercial_outcome"("p_entity_type" "text", "p_entity_id" "uuid", "p_outcome_type" "text", "p_currency" "text", "p_gross_amount_minor" bigint, "p_aerotrade_revenue_minor" bigint, "p_evidence_level" "text", "p_evidence_source" "text", "p_evidence_reference" "text", "p_notes" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."record_commercial_outcome"("p_entity_type" "text", "p_entity_id" "uuid", "p_outcome_type" "text", "p_currency" "text", "p_gross_amount_minor" bigint, "p_aerotrade_revenue_minor" bigint, "p_evidence_level" "text", "p_evidence_source" "text", "p_evidence_reference" "text", "p_notes" "text") IS 'Atomically records an admin-authorized commercial outcome, immutable evidence snapshot and WON opportunity status.';



CREATE OR REPLACE FUNCTION "public"."record_initial_marketplace_offer"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.initial_offer_amount_minor is not null then
    insert into public.marketplace_inquiry_offer_events (
      inquiry_id,
      event_type,
      actor_role,
      actor_user_id,
      amount_minor,
      currency,
      buyer_notification_status,
      idempotency_key
    ) values (
      new.id,
      'BUYER_OFFERED',
      'BUYER',
      new.buyer_user_id,
      new.initial_offer_amount_minor,
      new.currency,
      'not_required',
      'initial-offer:' || new.id::text
    ) on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."record_initial_marketplace_offer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_seller_inquiry_response"("p_inquiry_id" "uuid", "p_response" "text", "p_amount_minor" bigint DEFAULT NULL::bigint, "p_note" "text" DEFAULT NULL::"text") RETURNS TABLE("event_id" "uuid", "inquiry_status" "text", "notification_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_currency text;
  v_current_status text;
  v_event_type text;
  v_target_status text;
  v_event_id uuid;
  v_notification_status text;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_response not in ('ACCEPT', 'COUNTER', 'DECLINE') then raise exception 'Invalid response'; end if;
  if p_response = 'COUNTER' and (p_amount_minor is null or p_amount_minor <= 0) then
    raise exception 'A positive counteroffer amount is required';
  end if;
  if p_response <> 'COUNTER' and p_amount_minor is not null then
    raise exception 'Amount is only allowed for a counteroffer';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then raise exception 'Response note is too long'; end if;

  select inquiry.currency, inquiry.status,
    case when owner.role = 'admin' then 'ADMIN' else 'SELLER' end
  into v_currency, v_current_status, v_actor_role
  from public.marketplace_inquiries as inquiry
  join public.listings as listing on listing.id = inquiry.listing_id
  join public.users as owner on owner.id = v_actor
  where inquiry.id = p_inquiry_id
    and (listing.seller_id = v_actor or owner.role = 'admin')
  for update of inquiry;

  if v_currency is null then raise exception 'Enquiry not found or not authorized'; end if;
  if v_current_status in ('WON', 'LOST', 'SPAM') then raise exception 'This enquiry is already closed'; end if;

  v_event_type := case p_response
    when 'ACCEPT' then 'SELLER_ACCEPTED_FOR_NEGOTIATION'
    when 'COUNTER' then 'SELLER_COUNTERED'
    else 'SELLER_DECLINED'
  end;
  v_target_status := case when p_response = 'DECLINE' then 'LOST' else 'NEGOTIATING' end;

  -- A repeated button submission with the same semantic response within five
  -- minutes returns the original event instead of notifying the buyer twice.
  select event.id, event.buyer_notification_status
  into v_event_id, v_notification_status
  from public.marketplace_inquiry_offer_events as event
  where event.inquiry_id = p_inquiry_id
    and event.event_type = v_event_type
    and event.actor_user_id = v_actor
    and event.amount_minor is not distinct from p_amount_minor
    and event.note is not distinct from nullif(trim(p_note), '')
    and event.created_at >= timezone('utc'::text, now()) - interval '5 minutes'
  order by event.created_at desc
  limit 1;

  if v_event_id is null then
    insert into public.marketplace_inquiry_offer_events (
      inquiry_id, event_type, actor_role, actor_user_id, amount_minor, currency, note,
      buyer_notification_status
    ) values (
      p_inquiry_id, v_event_type, v_actor_role, v_actor, p_amount_minor, v_currency,
      nullif(trim(p_note), ''), 'pending'
    ) returning id, buyer_notification_status into v_event_id, v_notification_status;
  end if;

  update public.marketplace_inquiries
  set status = v_target_status,
      last_activity_at = timezone('utc'::text, now()),
      closed_at = case when v_target_status = 'LOST' then timezone('utc'::text, now()) else null end
  where id = p_inquiry_id;

  return query select v_event_id, v_target_status, v_notification_status;
end;
$$;


ALTER FUNCTION "public"."record_seller_inquiry_response"("p_inquiry_id" "uuid", "p_response" "text", "p_amount_minor" bigint, "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_listing_verification"("p_listing_id" "uuid", "p_requester" "uuid") RETURNS TABLE("event_id" "uuid", "verification_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_status text;
  new_event_id uuid;
begin
  if not exists (
    select 1
    from public.listings
    where id = p_listing_id
      and seller_id = p_requester
      and status in ('ACTIVE_PUBLIC', 'ACTIVE_PREMIUM')
      and coalesce(details ->> 'supporting_documents_available', 'false') = 'true'
  ) then
    raise exception 'Listing is not eligible for verification review';
  end if;

  select status into current_status
  from public.listing_verifications
  where listing_id = p_listing_id
  for update;

  if current_status in ('IN_REVIEW', 'VERIFIED') then
    raise exception 'Listing verification is already active';
  end if;

  insert into public.listing_verifications (
    listing_id, status, requested_by, requested_at,
    identity_checked, supporting_documents_checked,
    identity_review_basis, supporting_evidence_types,
    decision_reason, review_scope_acknowledged,
    verified_by, verified_at, last_decided_at
  ) values (
    p_listing_id, 'IN_REVIEW', p_requester, timezone('utc'::text, now()),
    false, false, null, '{}'::text[], null, false,
    null, null, null
  )
  on conflict (listing_id) do update set
    status = 'IN_REVIEW',
    requested_by = excluded.requested_by,
    requested_at = excluded.requested_at,
    identity_checked = false,
    supporting_documents_checked = false,
    identity_review_basis = null,
    supporting_evidence_types = '{}'::text[],
    decision_reason = null,
    review_scope_acknowledged = false,
    verified_by = null,
    verified_at = null;

  insert into public.listing_verification_events (
    listing_id, actor_user_id, event_type, from_status, to_status
  ) values (
    p_listing_id, p_requester, 'REQUESTED', current_status, 'IN_REVIEW'
  ) returning id into new_event_id;

  return query select new_event_id, 'IN_REVIEW'::text;
end;
$$;


ALTER FUNCTION "public"."request_listing_verification"("p_listing_id" "uuid", "p_requester" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."request_listing_verification"("p_listing_id" "uuid", "p_requester" "uuid") IS 'Atomically queues one seller-owned eligible listing and appends its audit event; stores no document copy.';



CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vb_redeem_open_gift"("p_reservation_id" "text", "p_flight_date" "date", "p_passenger_details" "jsonb", "p_expected_external_ref" "text", "p_authorization_ref" "text") RETURNS TABLE("reservation_id" "text", "redeemed_flight_date" "date", "redeemed_flight_time" time without time zone, "passenger_count" integer, "redeemed_total_weight_kg" numeric, "assigned_balloon_id" "text", "gift_tickets_redeemed" integer, "confirmed_seats_before" integer, "held_seats" integer, "sellable_capacity" integer, "economic_actions_performed" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_reservation public.vb_reservations%rowtype;
  v_source text;
  v_purchase_text text;
  v_verified_direct_gift boolean;
begin
  select * into v_reservation
  from public.vb_reservations as reservation
  where reservation.id = p_reservation_id
  for update;

  if not found then raise exception 'gift_reservation_not_found'; end if;

  v_source := lower(trim(coalesce(v_reservation.sale_source, '')));
  v_purchase_text := concat_ws(' ', coalesce(v_reservation.package_name, ''), coalesce(v_reservation.notes, ''));
  v_verified_direct_gift := (
    v_source = 'woocommerce'
    and v_purchase_text ~* '(billete[[:space:]_]+regalo|ticket[[:space:]_]+regalo|bono[[:space:]_]+regalo|reserva[[:space:]_]+abierta[[:space:]_/-]*regalo)'
  ) or (
    v_source = 'directa'
    and lower(coalesce(v_reservation.external_ref, '')) ~ '^web-[0-9]+$'
    and coalesce(v_reservation.notes, '') ~* 'pago[[:space:]]+redsys[[:space:]]+confirmado'
  );

  if v_source not in ('woocommerce', 'directa') then
    raise exception 'gift_reservation_source_not_eligible';
  end if;
  if not v_verified_direct_gift then
    raise exception 'gift_reservation_purchase_not_verified';
  end if;

  return query
  select *
  from public.vb_redeem_open_gift_internal_v1(
    p_reservation_id,
    p_flight_date,
    p_passenger_details,
    p_expected_external_ref,
    p_authorization_ref
  );
end;
$_$;


ALTER FUNCTION "public"."vb_redeem_open_gift"("p_reservation_id" "text", "p_flight_date" "date", "p_passenger_details" "jsonb", "p_expected_external_ref" "text", "p_authorization_ref" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."vb_redeem_open_gift"("p_reservation_id" "text", "p_flight_date" "date", "p_passenger_details" "jsonb", "p_expected_external_ref" "text", "p_authorization_ref" "text") IS 'Redeems only a verified direct/WooCommerce open gift after explicit authorization; marketplace reservations are rejected before mutation.';



CREATE OR REPLACE FUNCTION "public"."vb_redeem_open_gift_internal_v1"("p_reservation_id" "text", "p_flight_date" "date", "p_passenger_details" "jsonb", "p_expected_external_ref" "text", "p_authorization_ref" "text") RETURNS TABLE("reservation_id" "text", "redeemed_flight_date" "date", "redeemed_flight_time" time without time zone, "passenger_count" integer, "redeemed_total_weight_kg" numeric, "assigned_balloon_id" "text", "gift_tickets_redeemed" integer, "confirmed_seats_before" integer, "held_seats" integer, "sellable_capacity" integer, "economic_actions_performed" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_reservation public.vb_reservations%rowtype;
  v_departure public.vb_departures%rowtype;
  v_party_size integer;
  v_total_weight numeric(10,2);
  v_raw_passengers text;
  v_confirmed integer;
  v_held integer;
  v_bcx integer;
  v_bcy integer;
  v_unassigned integer;
  v_bcx_capacity integer;
  v_balloon_id text;
  v_codes text[];
  v_code text;
  v_ticket_count integer := 0;
  v_index integer;
  v_now timestamptz := now();
  v_marker text;
begin
  if nullif(trim(p_authorization_ref), '') is null then
    raise exception 'explicit_authorization_required';
  end if;
  if p_flight_date is null or p_flight_date < current_date then
    raise exception 'redemption_date_invalid';
  end if;
  if jsonb_typeof(p_passenger_details) <> 'array' then
    raise exception 'passenger_details_invalid';
  end if;

  select * into v_reservation
  from public.vb_reservations as reservation
  where reservation.id = p_reservation_id
  for update;

  if not found then raise exception 'gift_reservation_not_found'; end if;
  if lower(coalesce(v_reservation.external_ref, '')) <> lower(trim(p_expected_external_ref)) then
    raise exception 'gift_external_reference_mismatch';
  end if;

  v_marker := 'canje_regalo:' || p_flight_date::text;
  if v_reservation.status = 'confirmed'
    and v_reservation.flight_date = p_flight_date
    and position(v_marker in coalesce(v_reservation.notes, '')) > 0 then
    select count(*)::integer into v_ticket_count
    from public.vb_gift_tickets as ticket
    where ticket.reservation_id = p_reservation_id and ticket.status = 'redeemed';
    return query select
      v_reservation.id, v_reservation.flight_date, v_reservation.flight_time,
      v_reservation.passengers, v_reservation.total_weight_kg, v_reservation.balloon_id,
      v_ticket_count, 0, 0, 0, 0;
    return;
  end if;

  if v_reservation.status <> 'pending'
    or v_reservation.flight_date not in (date '9999-12-31', date '2099-12-31') then
    raise exception 'gift_reservation_not_open';
  end if;

  v_party_size := jsonb_array_length(p_passenger_details);
  if v_party_size < 1 or v_party_size <> v_reservation.passengers then
    raise exception 'gift_passenger_count_mismatch';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_passenger_details) as passenger(value)
    where length(trim(coalesce(passenger.value ->> 'name', ''))) < 3
      or coalesce((passenger.value ->> 'weightKg')::numeric, 0) < 20
      or coalesce((passenger.value ->> 'weightKg')::numeric, 0) > 250
  ) then
    raise exception 'gift_passenger_details_incomplete';
  end if;

  select * into v_departure
  from public.vb_departures as departure
  where departure.flight_date = p_flight_date
    and departure.sandbox = false
    and departure.availability_status = 'open'
  order by departure.flight_time
  limit 1
  for update;
  if not found then raise exception 'gift_departure_unavailable'; end if;

  select coalesce(sum(reservation.passengers), 0)::integer into v_confirmed
  from public.vb_reservations as reservation
  where reservation.flight_date = p_flight_date
    and reservation.status in ('confirmed', 'completed')
    and reservation.id <> p_reservation_id;

  select coalesce(sum(hold.seats), 0)::integer into v_held
  from public.vb_inventory_holds as hold
  where hold.departure_id = v_departure.id
    and hold.status = 'active'
    and hold.expires_at > v_now;

  if v_confirmed + v_held + v_party_size > v_departure.sellable_capacity then
    raise exception 'gift_departure_insufficient_capacity';
  end if;

  select
    coalesce(sum(reservation.passengers) filter (where lower(reservation.balloon_id) = 'cs-bcx'), 0)::integer,
    coalesce(sum(reservation.passengers) filter (where lower(reservation.balloon_id) = 'cs-bcy'), 0)::integer,
    coalesce(sum(reservation.passengers) filter (where lower(coalesce(reservation.balloon_id, '')) not in ('cs-bcx', 'cs-bcy')), 0)::integer
  into v_bcx, v_bcy, v_unassigned
  from public.vb_reservations as reservation
  where reservation.flight_date = p_flight_date
    and reservation.status in ('confirmed', 'completed')
    and reservation.id <> p_reservation_id;

  if v_unassigned > 0 then raise exception 'gift_balloon_assignment_requires_reconciliation'; end if;
  v_bcx_capacity := case when extract(month from p_flight_date)::integer between 6 and 9 then 22 else 24 end;
  if v_bcx + v_party_size <= v_bcx_capacity
    and (v_bcx_capacity - v_bcx >= 19 - v_bcy or v_bcy + v_party_size > 19) then
    v_balloon_id := 'cs-bcx';
  elsif v_bcy + v_party_size <= 19 then
    v_balloon_id := 'cs-bcy';
  elsif v_bcx + v_party_size <= v_bcx_capacity then
    v_balloon_id := 'cs-bcx';
  else
    raise exception 'gift_balloon_capacity_unavailable';
  end if;

  select
    sum((passenger.value ->> 'weightKg')::numeric),
    string_agg(trim(passenger.value ->> 'name') || ' ' || (passenger.value ->> 'weightKg') || ' kg', '; ' order by passenger.position)
  into v_total_weight, v_raw_passengers
  from jsonb_array_elements(p_passenger_details) with ordinality as passenger(value, position);

  update public.vb_reservations
  set status = 'confirmed',
      flight_date = p_flight_date,
      flight_time = v_departure.flight_time,
      passenger_details = p_passenger_details,
      total_weight_kg = v_total_weight,
      raw_passenger_text = v_raw_passengers,
      balloon_id = v_balloon_id,
      google_calendar_status = 'pending',
      google_calendar_event_id = '',
      needs_review = false,
      manual_override_fields = coalesce(manual_override_fields, '[]'::jsonb) || '["flightDate","status","passengerDetails","totalWeightKg","balloonId"]'::jsonb,
      notes = case when position(v_marker in coalesce(notes, '')) > 0 then notes
        else trim(both ' ' from coalesce(notes, '')) || ' | ' || v_marker || ' | autorizacion:' || trim(p_authorization_ref) end,
      updated_at = v_now
  where id = p_reservation_id;

  select array_agg(match[1]) into v_codes
  from regexp_matches(
    coalesce(v_reservation.notes, ''),
    '(VB-[0-9]{4}-[0-9]{5}-[0-9]{2})',
    'g'
  ) as extracted(match);

  for v_index in 1..v_party_size loop
    v_code := coalesce(
      v_codes[v_index],
      'VB-' || extract(year from v_now)::integer || '-' ||
        lpad(nullif(regexp_replace(coalesce(v_reservation.external_ref, ''), '[^0-9]', '', 'g'), ''), 5, '0') || '-' ||
        lpad(v_index::text, 2, '0')
    );
    if v_code is null then raise exception 'gift_ticket_code_unavailable'; end if;
    insert into public.vb_gift_tickets (
      code, reservation_id, buyer_name, buyer_email, recipient_name, passenger_count,
      status, redeemed_reservation_id, redeemed_at, notes, updated_at
    ) values (
      v_code, p_reservation_id, v_reservation.lead_name, v_reservation.email,
      trim(p_passenger_details -> (v_index - 1) ->> 'name'), 1,
      'redeemed', p_reservation_id, v_now,
      'redeemed_with_explicit_authorization:' || trim(p_authorization_ref), v_now
    )
    on conflict (code) do update set
      reservation_id = excluded.reservation_id,
      recipient_name = excluded.recipient_name,
      status = 'redeemed',
      redeemed_reservation_id = excluded.redeemed_reservation_id,
      redeemed_at = coalesce(public.vb_gift_tickets.redeemed_at, excluded.redeemed_at),
      notes = excluded.notes,
      updated_at = excluded.updated_at;
    v_ticket_count := v_ticket_count + 1;
  end loop;

  update public.vb_automation_tasks
  set status = 'resolved', resolved_at = v_now, updated_at = v_now
  where status <> 'resolved'
    and (stable_key = 'gift-redemption:' || p_reservation_id || ':' || p_flight_date::text
      or stable_key = 'reservation:' || p_reservation_id || ':gift_ticket_review');

  insert into public.vb_automation_events (
    event_type, severity, status, reservation_id, channel, details
  ) values (
    'gift_ticket_redemption', 'info', 'completed', p_reservation_id, 'whatsapp',
    jsonb_build_object(
      'flightDate', p_flight_date,
      'passengers', v_party_size,
      'balloonId', v_balloon_id,
      'authorizationRef', trim(p_authorization_ref),
      'economicActionsPerformed', 0
    )
  );

  return query select
    p_reservation_id, p_flight_date, v_departure.flight_time, v_party_size,
    v_total_weight, v_balloon_id, v_ticket_count, v_confirmed, v_held,
    v_departure.sellable_capacity, 0;
end;
$$;


ALTER FUNCTION "public"."vb_redeem_open_gift_internal_v1"("p_reservation_id" "text", "p_flight_date" "date", "p_passenger_details" "jsonb", "p_expected_external_ref" "text", "p_authorization_ref" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."vb_redeem_open_gift_internal_v1"("p_reservation_id" "text", "p_flight_date" "date", "p_passenger_details" "jsonb", "p_expected_external_ref" "text", "p_authorization_ref" "text") IS 'Atomically redeems an already-paid open gift after explicit authorization; performs no charge or refund.';



CREATE OR REPLACE FUNCTION "public"."vb_storefront_copy_checkout_attribution"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_attribution jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(new.metadata -> 'attribution') = 'object' then
    v_attribution := new.metadata -> 'attribution';
  end if;

  if new.status = 'paid' and nullif(new.reservation_id, '') is not null then
    update public.vb_reservations
    set attribution = v_attribution
    where id = new.reservation_id
      and attribution is distinct from v_attribution;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."vb_storefront_copy_checkout_attribution"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vb_storefront_create_checkout"("p_quote_id" "uuid", "p_departure_id" "uuid", "p_product" "text", "p_contact" "jsonb", "p_passengers" "jsonb", "p_redsys_order" "text", "p_sandbox" boolean DEFAULT true) RETURNS TABLE("checkout_id" "uuid", "hold_id" "uuid", "amount_cents" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_departure public.vb_departures%rowtype;
  v_quote public.vb_price_quotes%rowtype;
  v_party_size integer;
  v_confirmed integer;
  v_held integer;
  v_hold_id uuid;
  v_checkout_id uuid;
  v_unit_price numeric(10,2);
  v_amount_cents integer;
begin
  select * into v_departure
  from public.vb_departures
  where id = p_departure_id
  for update;

  if not found
    or v_departure.availability_status <> 'open'
    or v_departure.sandbox is distinct from p_sandbox then
    raise exception 'departure_unavailable';
  end if;

  select * into v_quote
  from public.vb_price_quotes
  where id = p_quote_id
    and departure_id = p_departure_id
  for update;

  if not found or v_quote.status <> 'quoted' or v_quote.expires_at <= now() then
    raise exception 'quote_expired';
  end if;

  if p_product not in ('classic', 'comfort') then
    raise exception 'product_invalid';
  end if;

  v_party_size := jsonb_array_length(p_passengers);
  if v_party_size <> v_quote.party_size or v_party_size < 1 then
    raise exception 'party_size_mismatch';
  end if;

  select coalesce(sum(passengers), 0)::integer into v_confirmed
  from public.vb_reservations
  where flight_date = v_departure.flight_date
    and status in ('confirmed', 'completed');

  select coalesce(sum(seats), 0)::integer into v_held
  from public.vb_inventory_holds
  where departure_id = p_departure_id
    and status = 'active'
    and expires_at > now();

  if v_confirmed + v_held + v_party_size > v_departure.sellable_capacity then
    raise exception 'insufficient_capacity';
  end if;

  v_unit_price := case when p_product = 'classic' then v_quote.classic_unit_price else v_quote.comfort_unit_price end;
  v_amount_cents := round(v_unit_price * v_party_size * 100)::integer;

  insert into public.vb_inventory_holds (
    departure_id, quote_id, channel, external_reference, seats, expires_at, status, metadata
  ) values (
    p_departure_id, p_quote_id, 'storefront', p_redsys_order, v_party_size,
    least(v_quote.expires_at, now() + interval '15 minutes'), 'active',
    jsonb_build_object('sandbox', p_sandbox, 'product', p_product)
  ) returning id into v_hold_id;

  insert into public.vb_storefront_checkouts (
    kind, status, sandbox, departure_id, quote_id, hold_id, redsys_order,
    product_code, party_size, amount_cents, contact, passengers, accepted_terms_at
  ) values (
    'dated_flight', 'awaiting_payment', p_sandbox, p_departure_id, p_quote_id, v_hold_id, p_redsys_order,
    'segovia_' || p_product, v_party_size, v_amount_cents, p_contact, p_passengers, now()
  ) returning id into v_checkout_id;

  update public.vb_price_quotes set status = 'held' where id = p_quote_id;

  return query select v_checkout_id, v_hold_id, v_amount_cents;
end;
$$;


ALTER FUNCTION "public"."vb_storefront_create_checkout"("p_quote_id" "uuid", "p_departure_id" "uuid", "p_product" "text", "p_contact" "jsonb", "p_passengers" "jsonb", "p_redsys_order" "text", "p_sandbox" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vb_storefront_create_checkout_with_attribution"("p_quote_id" "uuid", "p_departure_id" "uuid", "p_product" "text", "p_contact" "jsonb", "p_passengers" "jsonb", "p_redsys_order" "text", "p_sandbox" boolean DEFAULT true, "p_attribution" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("checkout_id" "uuid", "hold_id" "uuid", "amount_cents" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_checkout_id uuid;
  v_hold_id uuid;
  v_amount_cents integer;
  v_attribution jsonb := '{}'::jsonb;
begin
  if p_attribution is not null and jsonb_typeof(p_attribution) = 'object' then
    select coalesce(jsonb_object_agg(item.key, to_jsonb(
      left(
        regexp_replace(item.value #>> '{}', '[[:cntrl:]]', '', 'g'),
        case
          when item.key in ('utm_source', 'utm_medium') then 100
          when item.key in ('utm_campaign', 'utm_content', 'utm_term') then 160
          when item.key = 'landing_path' then 500
          else 255
        end
      )
    )), '{}'::jsonb)
    into v_attribution
    from jsonb_each(p_attribution) as item(key, value)
    where item.key in (
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
        'landing_path', 'referrer_host'
      )
      and jsonb_typeof(item.value) = 'string'
      and nullif(regexp_replace(item.value #>> '{}', '[[:cntrl:]]', '', 'g'), '') is not null
      and (item.key <> 'landing_path' or (
        (item.value #>> '{}') like '/%'
        and (item.value #>> '{}') not like '//%'
      ))
      and (item.key <> 'referrer_host' or lower(item.value #>> '{}') ~ '^[a-z0-9][a-z0-9.-]{0,254}$');
  end if;

  select base.checkout_id, base.hold_id, base.amount_cents
  into v_checkout_id, v_hold_id, v_amount_cents
  from public.vb_storefront_create_checkout(
    p_quote_id,
    p_departure_id,
    p_product,
    p_contact,
    p_passengers,
    p_redsys_order,
    p_sandbox
  ) as base;

  update public.vb_storefront_checkouts
  set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{attribution}', v_attribution, true)
  where id = v_checkout_id;

  return query select v_checkout_id, v_hold_id, v_amount_cents;
end;
$_$;


ALTER FUNCTION "public"."vb_storefront_create_checkout_with_attribution"("p_quote_id" "uuid", "p_departure_id" "uuid", "p_product" "text", "p_contact" "jsonb", "p_passengers" "jsonb", "p_redsys_order" "text", "p_sandbox" boolean, "p_attribution" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."vb_storefront_create_checkout_with_attribution"("p_quote_id" "uuid", "p_departure_id" "uuid", "p_product" "text", "p_contact" "jsonb", "p_passengers" "jsonb", "p_redsys_order" "text", "p_sandbox" boolean, "p_attribution" "jsonb") IS 'Atomically creates a storefront checkout and stores privacy-minimized acquisition attribution.';



CREATE OR REPLACE FUNCTION "public"."vb_storefront_finalize_paid_checkout"("p_checkout_id" "uuid", "p_provider_response" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("result_status" "text", "result_reservation_id" "text", "created" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_checkout public.vb_storefront_checkouts%rowtype;
  v_departure public.vb_departures%rowtype;
  v_reservation_id text;
  v_confirmed integer;
  v_other_holds integer;
  v_total_weight numeric(10,2);
  v_passenger_details jsonb;
  v_raw_passengers text;
  v_product_label text;
  v_now timestamptz := now();
begin
  select * into v_checkout
  from public.vb_storefront_checkouts
  where id = p_checkout_id
  for update;

  if not found or v_checkout.sandbox then
    raise exception 'checkout_unavailable';
  end if;

  if v_checkout.status = 'paid' and nullif(v_checkout.reservation_id, '') is not null then
    return query select 'paid'::text, v_checkout.reservation_id, false;
    return;
  end if;

  if v_checkout.status not in ('awaiting_payment', 'reconciliation_required') then
    raise exception 'checkout_not_finalizable';
  end if;

  v_reservation_id := 'res_web_' || lower(v_checkout.redsys_order);
  if exists (select 1 from public.vb_reservations where id = v_reservation_id) then
    update public.vb_storefront_checkouts
    set status = 'paid', reservation_id = v_reservation_id, paid_at = coalesce(paid_at, v_now),
        updated_at = v_now, provider_response = p_provider_response, error_code = null
    where id = v_checkout.id;
    return query select 'paid'::text, v_reservation_id, false;
    return;
  end if;

  v_product_label := case when v_checkout.product_code = 'segovia_comfort' then 'Comfort' else 'Classic' end;

  if v_checkout.kind = 'dated_flight' then
    select * into v_departure
    from public.vb_departures
    where id = v_checkout.departure_id
      and sandbox = false
    for update;

    if not found or v_departure.availability_status <> 'open' then
      update public.vb_storefront_checkouts
      set status = 'reconciliation_required', paid_at = coalesce(paid_at, v_now), updated_at = v_now,
          provider_response = p_provider_response, error_code = 'paid_departure_unavailable'
      where id = v_checkout.id;
      return query select 'reconciliation_required'::text, null::text, false;
      return;
    end if;

    select coalesce(sum(passengers), 0)::integer into v_confirmed
    from public.vb_reservations
    where flight_date = v_departure.flight_date
      and status in ('confirmed', 'completed');

    select coalesce(sum(seats), 0)::integer into v_other_holds
    from public.vb_inventory_holds
    where departure_id = v_departure.id
      and id is distinct from v_checkout.hold_id
      and status = 'active'
      and expires_at > v_now;

    if v_confirmed + v_other_holds + v_checkout.party_size > v_departure.sellable_capacity then
      update public.vb_storefront_checkouts
      set status = 'reconciliation_required', paid_at = coalesce(paid_at, v_now), updated_at = v_now,
          provider_response = p_provider_response, error_code = 'paid_capacity_conflict'
      where id = v_checkout.id;
      return query select 'reconciliation_required'::text, null::text, false;
      return;
    end if;

    select
      coalesce(jsonb_agg(jsonb_build_object(
        'id', 'pax_' || passenger.position,
        'order', passenger.position,
        'name', passenger.value ->> 'fullName',
        'weightKg', (passenger.value ->> 'weightKg')::numeric,
        'isLeadPassenger', passenger.position = 1,
        'declaration', jsonb_build_object('status', 'pending', 'signedAt', '', 'documentUrl', '')
      ) order by passenger.position), '[]'::jsonb),
      coalesce(sum((passenger.value ->> 'weightKg')::numeric), 0),
      coalesce(string_agg((passenger.value ->> 'fullName') || ' ' || (passenger.value ->> 'weightKg') || ' kg', '; ' order by passenger.position), '')
    into v_passenger_details, v_total_weight, v_raw_passengers
    from jsonb_array_elements(v_checkout.passengers) with ordinality as passenger(value, position);

    insert into public.vb_reservations (
      id, created_at, updated_at, status, flight_date, flight_time, passengers, total_weight_kg,
      lead_name, phone, email, sale_source, source_channel, external_ref, passenger_details,
      raw_passenger_text, needs_review, manual_override_fields, last_imported_at, balloon_id,
      google_calendar_status, google_calendar_event_id, package_name, pickup_location, notes,
      destination_code, product_code, unit_price_gross, total_price_gross, currency,
      channel_commission, net_revenue, price_quote_id
    ) values (
      v_reservation_id, v_now, v_now, 'confirmed', v_departure.flight_date, v_departure.flight_time,
      v_checkout.party_size, v_total_weight, v_checkout.contact ->> 'fullName',
      v_checkout.contact ->> 'phone', lower(v_checkout.contact ->> 'email'), 'directa', 'directa',
      'web-' || v_checkout.redsys_order, v_passenger_details, v_raw_passengers, false, '[]'::jsonb,
      v_now, 'vb-8', 'pending', '', 'Voyager Store - Vuelo en globo Segovia ' || v_product_label,
      '', 'Pago Redsys confirmado | external_id:web-' || v_checkout.redsys_order,
      'segovia', v_checkout.product_code, (v_checkout.amount_cents::numeric / v_checkout.party_size / 100),
      (v_checkout.amount_cents::numeric / 100), 'EUR', 0, (v_checkout.amount_cents::numeric / 100),
      v_checkout.quote_id
    );
  else
    insert into public.vb_reservations (
      id, created_at, updated_at, status, flight_date, flight_time, passengers, total_weight_kg,
      lead_name, phone, email, sale_source, source_channel, external_ref, passenger_details,
      raw_passenger_text, needs_review, manual_override_fields, last_imported_at, balloon_id,
      google_calendar_status, google_calendar_event_id, package_name, pickup_location, notes,
      destination_code, product_code, unit_price_gross, total_price_gross, currency,
      channel_commission, net_revenue, price_quote_id
    ) values (
      v_reservation_id, v_now, v_now, 'pending', date '2099-12-31', time '00:00',
      v_checkout.party_size, v_checkout.party_size * 80, v_checkout.contact ->> 'fullName',
      v_checkout.contact ->> 'phone', lower(v_checkout.contact ->> 'email'), 'directa', 'directa',
      'web-' || v_checkout.redsys_order, '[]'::jsonb, '', false, '[]'::jsonb, v_now, 'vb-8',
      'not_applicable', '', 'Reserva abierta / regalo - ' || v_product_label, '',
      'Pago Redsys confirmado | destinatario:' || coalesce(v_checkout.gift_recipient ->> 'fullName', '') ||
        ' | mensaje:' || coalesce(v_checkout.gift_recipient ->> 'message', '') ||
        ' | external_id:web-' || v_checkout.redsys_order,
      'segovia', v_checkout.product_code, (v_checkout.amount_cents::numeric / v_checkout.party_size / 100),
      (v_checkout.amount_cents::numeric / 100), 'EUR', 0, (v_checkout.amount_cents::numeric / 100), null
    );
  end if;

  update public.vb_storefront_checkouts
  set status = 'paid', reservation_id = v_reservation_id, paid_at = coalesce(paid_at, v_now),
      updated_at = v_now, provider_response = p_provider_response, error_code = null
  where id = v_checkout.id;

  if v_checkout.hold_id is not null then
    update public.vb_inventory_holds
    set status = 'converted', updated_at = v_now
    where id = v_checkout.hold_id;
  end if;

  if v_checkout.quote_id is not null then
    update public.vb_price_quotes set status = 'converted' where id = v_checkout.quote_id;
  end if;

  return query select 'paid'::text, v_reservation_id, true;
end;
$$;


ALTER FUNCTION "public"."vb_storefront_finalize_paid_checkout"("p_checkout_id" "uuid", "p_provider_response" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."vb_storefront_finalize_paid_checkout"("p_checkout_id" "uuid", "p_provider_response" "jsonb") IS 'Atomically converts one verified production Redsys checkout into at most one Voyager reservation.';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "text" NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_email" "text" NOT NULL,
    "customer_phone" "text",
    "flight_type" "text" NOT NULL,
    "flight_date" "text" NOT NULL,
    "pax" integer NOT NULL,
    "total_price" numeric NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "redsys_response" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "passengers" "jsonb" DEFAULT '[]'::"jsonb",
    CONSTRAINT "bookings_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."catalog_search_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "event_key" "text" NOT NULL,
    "query_text" "text",
    "category" "text",
    "country" "text",
    "sort" "text" DEFAULT 'newest'::"text" NOT NULL,
    "result_count" integer NOT NULL,
    "zero_results" boolean NOT NULL,
    "referrer_host" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "journey_key" "text",
    CONSTRAINT "catalog_search_events_category_check" CHECK ((("category" IS NULL) OR ("category" = ANY (ARRAY['complete'::"text", 'envelopes'::"text", 'baskets'::"text", 'burners'::"text", 'bottom-end'::"text", 'cylinders'::"text", 'other-equipment'::"text"])))),
    CONSTRAINT "catalog_search_events_country_check" CHECK ((("country" IS NULL) OR ("char_length"("country") <= 100))),
    CONSTRAINT "catalog_search_events_event_key_check" CHECK (("char_length"("event_key") = 64)),
    CONSTRAINT "catalog_search_events_journey_key_length" CHECK ((("journey_key" IS NULL) OR ("char_length"("journey_key") = 64))),
    CONSTRAINT "catalog_search_events_query_text_check" CHECK ((("query_text" IS NULL) OR ("char_length"("query_text") <= 120))),
    CONSTRAINT "catalog_search_events_referrer_host_check" CHECK ((("referrer_host" IS NULL) OR ("char_length"("referrer_host") <= 255))),
    CONSTRAINT "catalog_search_events_result_count_check" CHECK ((("result_count" >= 0) AND ("result_count" <= 10000))),
    CONSTRAINT "catalog_search_events_sort_check" CHECK (("sort" = ANY (ARRAY['newest'::"text", 'price_asc'::"text", 'price_desc'::"text"]))),
    CONSTRAINT "catalog_search_events_utm_campaign_check" CHECK ((("utm_campaign" IS NULL) OR ("char_length"("utm_campaign") <= 120))),
    CONSTRAINT "catalog_search_events_utm_medium_check" CHECK ((("utm_medium" IS NULL) OR ("char_length"("utm_medium") <= 120))),
    CONSTRAINT "catalog_search_events_utm_source_check" CHECK ((("utm_source" IS NULL) OR ("char_length"("utm_source") <= 120))),
    CONSTRAINT "catalog_search_zero_result_consistency" CHECK (("zero_results" = ("result_count" = 0)))
);


ALTER TABLE "public"."catalog_search_events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."catalog_search_events"."journey_key" IS 'Daily server-HMAC journey key; contains no raw visitor or user identifier.';



CREATE TABLE IF NOT EXISTS "public"."commercial_notification_receipts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "notification_type" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "recipient_role" "text" DEFAULT 'admin'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "provider_message_id" "text",
    "error_message" "text",
    "idempotency_key" "text" NOT NULL,
    "attempted_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "delivery_attempts" integer DEFAULT 0 NOT NULL,
    "next_attempt_at" timestamp with time zone,
    CONSTRAINT "commercial_notification_receipts_delivery_attempts_check" CHECK ((("delivery_attempts" >= 0) AND ("delivery_attempts" <= 2))),
    CONSTRAINT "commercial_notification_receipts_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['listing'::"text", 'quote_request'::"text", 'wanted_request'::"text", 'inquiry'::"text", 'seller_assistance'::"text", 'quote_proposal'::"text", 'listing_watch'::"text"]))),
    CONSTRAINT "commercial_notification_receipts_notification_type_check" CHECK (("notification_type" = ANY (ARRAY['listing_created_admin'::"text", 'quote_created_admin'::"text", 'wanted_request_admin'::"text", 'listing_quality_quarantine'::"text", 'inquiry_buyer_ack'::"text", 'inquiry_seller_followup'::"text", 'inquiry_buyer_seller_response'::"text", 'inquiry_seller_buyer_response'::"text", 'quote_admin_followup'::"text", 'premium_listing_checkout_recovery'::"text", 'wanted_match_buyer'::"text", 'listing_verification_requested'::"text", 'listing_verification_decision'::"text", 'seller_assistance_created_admin'::"text", 'seller_assistance_admin_followup'::"text", 'new_balloon_proposal_buyer'::"text", 'new_balloon_buyer_ack'::"text", 'listing_watch_confirmation'::"text", 'listing_watch_update'::"text", 'listing_availability_request'::"text"]))),
    CONSTRAINT "commercial_notification_receipts_recipient_role_check" CHECK (("recipient_role" = ANY (ARRAY['admin'::"text", 'seller'::"text", 'buyer'::"text"]))),
    CONSTRAINT "commercial_notification_receipts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."commercial_notification_receipts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."commercial_notification_receipts"."delivery_attempts" IS 'Provider delivery attempts. Transactional messages have a closed budget of two attempts.';



COMMENT ON COLUMN "public"."commercial_notification_receipts"."next_attempt_at" IS 'Earliest safe retry time after a failed or interrupted provider attempt; null when accepted or exhausted.';



COMMENT ON CONSTRAINT "commercial_notification_receipts_notification_type_check" ON "public"."commercial_notification_receipts" IS 'Closed vocabulary for transactional commercial delivery receipts. listing_availability_request asks an existing seller to reconfirm a live advert; it never changes listing state.';



CREATE TABLE IF NOT EXISTS "public"."commercial_outcome_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "outcome_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "outcome_type" "text" NOT NULL,
    "currency" "text" NOT NULL,
    "gross_amount_minor" bigint NOT NULL,
    "aerotrade_revenue_minor" bigint NOT NULL,
    "evidence_level" "text" NOT NULL,
    "evidence_source" "text" NOT NULL,
    "evidence_reference" "text",
    "notes" "text",
    "recorded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "commercial_outcome_events_check" CHECK ((("aerotrade_revenue_minor" >= 0) AND ("aerotrade_revenue_minor" <= "gross_amount_minor"))),
    CONSTRAINT "commercial_outcome_events_currency_check" CHECK (("currency" = ANY (ARRAY['EUR'::"text", 'GBP'::"text", 'USD'::"text"]))),
    CONSTRAINT "commercial_outcome_events_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['marketplace_inquiry'::"text", 'quote_request'::"text"]))),
    CONSTRAINT "commercial_outcome_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['OUTCOME_RECORDED'::"text", 'OUTCOME_UPDATED'::"text"]))),
    CONSTRAINT "commercial_outcome_events_evidence_level_check" CHECK (("evidence_level" = ANY (ARRAY['reported'::"text", 'documented'::"text", 'settled'::"text"]))),
    CONSTRAINT "commercial_outcome_events_evidence_reference_check" CHECK ((("evidence_reference" IS NULL) OR (("char_length"("evidence_reference") >= 3) AND ("char_length"("evidence_reference") <= 200)))),
    CONSTRAINT "commercial_outcome_events_evidence_source_check" CHECK (("evidence_source" = ANY (ARRAY['operator_report'::"text", 'contract'::"text", 'invoice'::"text", 'bank_transfer'::"text", 'stripe_payment'::"text", 'other_document'::"text"]))),
    CONSTRAINT "commercial_outcome_events_gross_amount_minor_check" CHECK (("gross_amount_minor" >= 0)),
    CONSTRAINT "commercial_outcome_events_notes_check" CHECK ((("notes" IS NULL) OR ("char_length"("notes") <= 2000))),
    CONSTRAINT "commercial_outcome_events_outcome_type_check" CHECK (("outcome_type" = ANY (ARRAY['sale'::"text", 'intermediation'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."commercial_outcome_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commercial_outcomes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "outcome_type" "text" DEFAULT 'sale'::"text" NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "gross_amount_minor" bigint DEFAULT 0 NOT NULL,
    "aerotrade_revenue_minor" bigint DEFAULT 0 NOT NULL,
    "evidence_level" "text" DEFAULT 'reported'::"text" NOT NULL,
    "notes" "text",
    "recorded_by" "uuid",
    "closed_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "evidence_source" "text" DEFAULT 'operator_report'::"text" NOT NULL,
    "evidence_reference" "text",
    "settled_at" timestamp with time zone,
    CONSTRAINT "commercial_outcomes_check" CHECK ((("aerotrade_revenue_minor" >= 0) AND ("aerotrade_revenue_minor" <= "gross_amount_minor"))),
    CONSTRAINT "commercial_outcomes_currency_check" CHECK (("currency" = ANY (ARRAY['EUR'::"text", 'GBP'::"text", 'USD'::"text"]))),
    CONSTRAINT "commercial_outcomes_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['marketplace_inquiry'::"text", 'quote_request'::"text"]))),
    CONSTRAINT "commercial_outcomes_evidence_consistency" CHECK (((("evidence_level" = 'reported'::"text") AND ("evidence_source" = 'operator_report'::"text")) OR (("evidence_level" = 'documented'::"text") AND ("evidence_source" = ANY (ARRAY['contract'::"text", 'invoice'::"text", 'bank_transfer'::"text", 'stripe_payment'::"text", 'other_document'::"text"])) AND ("evidence_reference" IS NOT NULL)) OR (("evidence_level" = 'settled'::"text") AND ("evidence_source" = ANY (ARRAY['bank_transfer'::"text", 'stripe_payment'::"text"])) AND ("evidence_reference" IS NOT NULL)))),
    CONSTRAINT "commercial_outcomes_evidence_level_check" CHECK (("evidence_level" = ANY (ARRAY['reported'::"text", 'documented'::"text", 'settled'::"text"]))),
    CONSTRAINT "commercial_outcomes_evidence_reference_length" CHECK ((("evidence_reference" IS NULL) OR (("char_length"("evidence_reference") >= 3) AND ("char_length"("evidence_reference") <= 200)))),
    CONSTRAINT "commercial_outcomes_evidence_source_check" CHECK (("evidence_source" = ANY (ARRAY['operator_report'::"text", 'contract'::"text", 'invoice'::"text", 'bank_transfer'::"text", 'stripe_payment'::"text", 'other_document'::"text"]))),
    CONSTRAINT "commercial_outcomes_gross_amount_minor_check" CHECK (("gross_amount_minor" >= 0)),
    CONSTRAINT "commercial_outcomes_notes_check" CHECK ((("notes" IS NULL) OR ("char_length"("notes") <= 2000))),
    CONSTRAINT "commercial_outcomes_outcome_type_check" CHECK (("outcome_type" = ANY (ARRAY['sale'::"text", 'intermediation'::"text", 'other'::"text"]))),
    CONSTRAINT "commercial_outcomes_settlement_consistency" CHECK ((("evidence_level" = 'settled'::"text") = ("settled_at" IS NOT NULL)))
);


ALTER TABLE "public"."commercial_outcomes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."images" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "is_primary" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."indexing_submission_receipts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "batch_key" "text" NOT NULL,
    "provider" "text" DEFAULT 'INDEXNOW'::"text" NOT NULL,
    "url_fingerprint" "text" NOT NULL,
    "url_count" integer NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "provider_status_code" integer,
    "error_code" "text",
    "attempted_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "indexing_submission_acceptance_consistency" CHECK (((("status" = 'ACCEPTED'::"text") AND ("accepted_at" IS NOT NULL) AND ("error_code" IS NULL)) OR (("status" <> 'ACCEPTED'::"text") AND ("accepted_at" IS NULL)))),
    CONSTRAINT "indexing_submission_receipts_attempts_check" CHECK ((("attempts" >= 0) AND ("attempts" <= 3))),
    CONSTRAINT "indexing_submission_receipts_batch_key_check" CHECK (("char_length"("batch_key") = 64)),
    CONSTRAINT "indexing_submission_receipts_error_code_check" CHECK ((("error_code" IS NULL) OR ("error_code" = ANY (ARRAY['NETWORK_ERROR'::"text", 'PROVIDER_REJECTED'::"text", 'PERSISTENCE_ERROR'::"text"])))),
    CONSTRAINT "indexing_submission_receipts_provider_check" CHECK (("provider" = 'INDEXNOW'::"text")),
    CONSTRAINT "indexing_submission_receipts_provider_status_code_check" CHECK ((("provider_status_code" IS NULL) OR (("provider_status_code" >= 100) AND ("provider_status_code" <= 599)))),
    CONSTRAINT "indexing_submission_receipts_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'ACCEPTED'::"text", 'FAILED'::"text"]))),
    CONSTRAINT "indexing_submission_receipts_url_count_check" CHECK ((("url_count" >= 1) AND ("url_count" <= 10000))),
    CONSTRAINT "indexing_submission_receipts_url_fingerprint_check" CHECK (("char_length"("url_fingerprint") = 64))
);


ALTER TABLE "public"."indexing_submission_receipts" OWNER TO "postgres";


COMMENT ON TABLE "public"."indexing_submission_receipts" IS 'Private aggregate evidence of public URL discovery submissions; stores no URL list, query, credential or personal data.';



CREATE TABLE IF NOT EXISTS "public"."listing_availability_confirmations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "listing_status" "text" NOT NULL,
    "source" "text" DEFAULT 'SELLER_DASHBOARD'::"text" NOT NULL,
    "confirmed_on" "date" DEFAULT CURRENT_DATE NOT NULL,
    "confirmed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "listing_availability_confirmations_listing_status_check" CHECK (("listing_status" = ANY (ARRAY['ACTIVE_PUBLIC'::"text", 'ACTIVE_PREMIUM'::"text"]))),
    CONSTRAINT "listing_availability_confirmations_source_check" CHECK (("source" = 'SELLER_DASHBOARD'::"text"))
);


ALTER TABLE "public"."listing_availability_confirmations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "event_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "event_key" "text",
    "referrer_host" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "journey_key" "text",
    CONSTRAINT "listing_events_event_key_length" CHECK ((("event_key" IS NULL) OR ("char_length"("event_key") = 64))),
    CONSTRAINT "listing_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['VIEW'::"text", 'CONTACT_REVEAL'::"text"]))),
    CONSTRAINT "listing_events_journey_key_length" CHECK ((("journey_key" IS NULL) OR ("char_length"("journey_key") = 64))),
    CONSTRAINT "listing_events_referrer_host_length" CHECK ((("referrer_host" IS NULL) OR ("char_length"("referrer_host") <= 255))),
    CONSTRAINT "listing_events_utm_campaign_length" CHECK ((("utm_campaign" IS NULL) OR ("char_length"("utm_campaign") <= 120))),
    CONSTRAINT "listing_events_utm_medium_length" CHECK ((("utm_medium" IS NULL) OR ("char_length"("utm_medium") <= 120))),
    CONSTRAINT "listing_events_utm_source_length" CHECK ((("utm_source" IS NULL) OR ("char_length"("utm_source") <= 120)))
);


ALTER TABLE "public"."listing_events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."listing_events"."journey_key" IS 'Daily server-HMAC journey key; contains no raw visitor or user identifier.';



CREATE TABLE IF NOT EXISTS "public"."listing_lifecycle_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "recorded_by" "uuid" NOT NULL,
    "actor_role" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "sale_channel" "text",
    "marketplace_inquiry_id" "uuid",
    "gross_amount_minor" bigint,
    "currency" "text",
    "previous_status" "text" NOT NULL,
    "new_status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "listing_lifecycle_event_consistency" CHECK (((("event_type" = 'WITHDRAWN'::"text") AND ("sale_channel" IS NULL) AND ("marketplace_inquiry_id" IS NULL) AND ("gross_amount_minor" IS NULL) AND ("currency" IS NULL) AND ("new_status" = 'ARCHIVED'::"text")) OR (("event_type" = 'SOLD'::"text") AND ("sale_channel" IS NOT NULL) AND ("new_status" = 'SOLD'::"text") AND ((("sale_channel" = 'AEROTRADE'::"text") AND ("marketplace_inquiry_id" IS NOT NULL)) OR (("sale_channel" <> 'AEROTRADE'::"text") AND ("marketplace_inquiry_id" IS NULL))) AND ((("gross_amount_minor" IS NULL) AND ("currency" IS NULL)) OR (("gross_amount_minor" IS NOT NULL) AND ("currency" IS NOT NULL)))))),
    CONSTRAINT "listing_lifecycle_events_actor_role_check" CHECK (("actor_role" = ANY (ARRAY['SELLER'::"text", 'ADMIN'::"text"]))),
    CONSTRAINT "listing_lifecycle_events_currency_check" CHECK ((("currency" IS NULL) OR ("currency" = ANY (ARRAY['EUR'::"text", 'GBP'::"text", 'USD'::"text"])))),
    CONSTRAINT "listing_lifecycle_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['SOLD'::"text", 'WITHDRAWN'::"text"]))),
    CONSTRAINT "listing_lifecycle_events_gross_amount_minor_check" CHECK ((("gross_amount_minor" IS NULL) OR ("gross_amount_minor" > 0))),
    CONSTRAINT "listing_lifecycle_events_new_status_check" CHECK (("new_status" = ANY (ARRAY['SOLD'::"text", 'ARCHIVED'::"text"]))),
    CONSTRAINT "listing_lifecycle_events_previous_status_check" CHECK (("previous_status" = ANY (ARRAY['DRAFT'::"text", 'PENDING_PAYMENT'::"text", 'ACTIVE_PREMIUM'::"text", 'ACTIVE_PUBLIC'::"text"]))),
    CONSTRAINT "listing_lifecycle_events_sale_channel_check" CHECK (("sale_channel" = ANY (ARRAY['AEROTRADE'::"text", 'OTHER_CHANNEL'::"text", 'NOT_DISCLOSED'::"text"])))
);


ALTER TABLE "public"."listing_lifecycle_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_quality_state" (
    "listing_id" "uuid" NOT NULL,
    "issue_code" "text" DEFAULT 'NO_REACHABLE_IMAGE'::"text" NOT NULL,
    "status" "text" DEFAULT 'SUSPECT'::"text" NOT NULL,
    "last_observation" "text" DEFAULT 'DEFINITELY_MISSING'::"text" NOT NULL,
    "consecutive_failures" integer DEFAULT 0 NOT NULL,
    "first_failed_at" timestamp with time zone,
    "last_checked_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "previous_listing_status" "text",
    "quarantined_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "notification_status" "text" DEFAULT 'not_sent'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "listing_quality_state_consecutive_failures_check" CHECK (("consecutive_failures" >= 0)),
    CONSTRAINT "listing_quality_state_issue_code_check" CHECK (("issue_code" = 'NO_REACHABLE_IMAGE'::"text")),
    CONSTRAINT "listing_quality_state_last_observation_check" CHECK (("last_observation" = ANY (ARRAY['AVAILABLE'::"text", 'DEFINITELY_MISSING'::"text", 'UNKNOWN'::"text"]))),
    CONSTRAINT "listing_quality_state_notification_status_check" CHECK (("notification_status" = ANY (ARRAY['not_sent'::"text", 'pending'::"text", 'accepted'::"text", 'failed'::"text"]))),
    CONSTRAINT "listing_quality_state_previous_listing_status_check" CHECK ((("previous_listing_status" IS NULL) OR ("previous_listing_status" = ANY (ARRAY['ACTIVE_PUBLIC'::"text", 'ACTIVE_PREMIUM'::"text"])))),
    CONSTRAINT "listing_quality_state_status_check" CHECK (("status" = ANY (ARRAY['HEALTHY'::"text", 'SUSPECT'::"text", 'QUARANTINED'::"text", 'RESOLVED'::"text"])))
);


ALTER TABLE "public"."listing_quality_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_verification_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "event_type" "text" NOT NULL,
    "from_status" "text",
    "to_status" "text" NOT NULL,
    "identity_review_basis" "text",
    "supporting_evidence_types" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "decision_reason" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "listing_verification_events_decision_reason_check" CHECK ((("decision_reason" IS NULL) OR ("decision_reason" = ANY (ARRAY['IDENTITY_UNCONFIRMED'::"text", 'INSUFFICIENT_EVIDENCE'::"text", 'LISTING_DATA_INCONSISTENT'::"text", 'EVIDENCE_NOT_CURRENT'::"text", 'OTHER_REVIEW_REQUIRED'::"text"])))),
    CONSTRAINT "listing_verification_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['REQUESTED'::"text", 'VERIFIED'::"text", 'REJECTED'::"text", 'UNVERIFIED'::"text"]))),
    CONSTRAINT "listing_verification_events_from_status_check" CHECK ((("from_status" IS NULL) OR ("from_status" = ANY (ARRAY['UNVERIFIED'::"text", 'IN_REVIEW'::"text", 'VERIFIED'::"text", 'REJECTED'::"text"])))),
    CONSTRAINT "listing_verification_events_identity_review_basis_check" CHECK ((("identity_review_basis" IS NULL) OR ("identity_review_basis" = ANY (ARRAY['ACCOUNT_AND_LIVE_CALL'::"text", 'BUSINESS_REGISTRY'::"text", 'IDENTITY_DOCUMENT_REVIEWED'::"text"])))),
    CONSTRAINT "listing_verification_events_supporting_evidence_types_check" CHECK (("supporting_evidence_types" <@ ARRAY['REGISTRATION'::"text", 'SERIAL_PLATE'::"text", 'PURCHASE_OR_OWNERSHIP'::"text", 'MAINTENANCE_RECORDS'::"text", 'INSPECTION_RECORD'::"text", 'MANUFACTURER_RECORD'::"text", 'OTHER_SUPPORTING'::"text"])),
    CONSTRAINT "listing_verification_events_to_status_check" CHECK (("to_status" = ANY (ARRAY['UNVERIFIED'::"text", 'IN_REVIEW'::"text", 'VERIFIED'::"text", 'REJECTED'::"text"])))
);


ALTER TABLE "public"."listing_verification_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_verifications" (
    "listing_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'UNVERIFIED'::"text" NOT NULL,
    "identity_checked" boolean DEFAULT false NOT NULL,
    "supporting_documents_checked" boolean DEFAULT false NOT NULL,
    "public_summary" "text" DEFAULT 'Seller identity and supporting listing evidence reviewed by AeroTrade. This is not an airworthiness inspection.'::"text" NOT NULL,
    "verified_by" "uuid",
    "verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "requested_by" "uuid",
    "requested_at" timestamp with time zone,
    "identity_review_basis" "text",
    "supporting_evidence_types" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "decision_reason" "text",
    "review_scope_acknowledged" boolean DEFAULT false NOT NULL,
    "last_decided_at" timestamp with time zone,
    CONSTRAINT "listing_verifications_decision_reason_check" CHECK ((("decision_reason" IS NULL) OR ("decision_reason" = ANY (ARRAY['IDENTITY_UNCONFIRMED'::"text", 'INSUFFICIENT_EVIDENCE'::"text", 'LISTING_DATA_INCONSISTENT'::"text", 'EVIDENCE_NOT_CURRENT'::"text", 'OTHER_REVIEW_REQUIRED'::"text"])))),
    CONSTRAINT "listing_verifications_identity_review_basis_check" CHECK ((("identity_review_basis" IS NULL) OR ("identity_review_basis" = ANY (ARRAY['ACCOUNT_AND_LIVE_CALL'::"text", 'BUSINESS_REGISTRY'::"text", 'IDENTITY_DOCUMENT_REVIEWED'::"text"])))),
    CONSTRAINT "listing_verifications_public_summary_check" CHECK ((("char_length"("public_summary") >= 20) AND ("char_length"("public_summary") <= 500))),
    CONSTRAINT "listing_verifications_status_check" CHECK (("status" = ANY (ARRAY['UNVERIFIED'::"text", 'IN_REVIEW'::"text", 'VERIFIED'::"text", 'REJECTED'::"text"]))),
    CONSTRAINT "listing_verifications_supporting_evidence_types_check" CHECK (("supporting_evidence_types" <@ ARRAY['REGISTRATION'::"text", 'SERIAL_PLATE'::"text", 'PURCHASE_OR_OWNERSHIP'::"text", 'MAINTENANCE_RECORDS'::"text", 'INSPECTION_RECORD'::"text", 'MANUFACTURER_RECORD'::"text", 'OTHER_SUPPORTING'::"text"])),
    CONSTRAINT "listing_verifications_verified_evidence_check" CHECK ((("status" <> 'VERIFIED'::"text") OR (("identity_checked" = true) AND ("supporting_documents_checked" = true) AND ("identity_review_basis" IS NOT NULL) AND ("cardinality"("supporting_evidence_types") >= 1) AND ("review_scope_acknowledged" = true) AND ("verified_by" IS NOT NULL) AND ("verified_at" IS NOT NULL))))
);


ALTER TABLE "public"."listing_verifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_watch_dispatches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "watcher_id" "uuid" NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "snapshot_hash" "text" NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "provider_message_id" "text",
    "attempted_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "listing_watch_dispatches_delivery_state" CHECK (((("status" = 'ACCEPTED'::"text") AND ("accepted_at" IS NOT NULL) AND ("provider_message_id" IS NOT NULL)) OR (("status" = ANY (ARRAY['PENDING'::"text", 'FAILED'::"text", 'CANCELLED'::"text"])) AND ("accepted_at" IS NULL)))),
    CONSTRAINT "listing_watch_dispatches_snapshot_hash_check" CHECK (("char_length"("snapshot_hash") = 64)),
    CONSTRAINT "listing_watch_dispatches_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'ACCEPTED'::"text", 'FAILED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."listing_watch_dispatches" OWNER TO "postgres";


COMMENT ON TABLE "public"."listing_watch_dispatches" IS 'Private idempotent provider evidence for material listing-change alerts.';



CREATE TABLE IF NOT EXISTS "public"."listing_watchers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "buyer_user_id" "uuid",
    "email" "text" NOT NULL,
    "normalized_email" "text" NOT NULL,
    "status" "text" DEFAULT 'PENDING_CONFIRMATION'::"text" NOT NULL,
    "privacy_consent_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "confirmed_at" timestamp with time zone,
    "unsubscribed_at" timestamp with time zone,
    "submission_key" "text",
    "source_context" "text" DEFAULT 'listing_detail'::"text" NOT NULL,
    "referrer_host" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "journey_key" "text",
    "initial_snapshot_hash" "text" NOT NULL,
    "last_notified_snapshot_hash" "text",
    "last_notified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "closed_at" timestamp with time zone,
    CONSTRAINT "listing_watchers_check" CHECK (((("char_length"("normalized_email") >= 5) AND ("char_length"("normalized_email") <= 320)) AND ("normalized_email" = "lower"(TRIM(BOTH FROM "email"))))),
    CONSTRAINT "listing_watchers_confirmation_state" CHECK (((("status" = 'ACTIVE'::"text") AND ("confirmed_at" IS NOT NULL) AND ("unsubscribed_at" IS NULL) AND ("closed_at" IS NULL)) OR (("status" = 'UNSUBSCRIBED'::"text") AND ("unsubscribed_at" IS NOT NULL) AND ("closed_at" IS NULL)) OR (("status" = 'LISTING_CLOSED'::"text") AND ("closed_at" IS NOT NULL) AND ("unsubscribed_at" IS NULL)) OR (("status" = ANY (ARRAY['PENDING_CONFIRMATION'::"text", 'BLOCKED'::"text"])) AND ("closed_at" IS NULL)))),
    CONSTRAINT "listing_watchers_email_check" CHECK ((("char_length"("email") >= 5) AND ("char_length"("email") <= 320))),
    CONSTRAINT "listing_watchers_initial_snapshot_hash_check" CHECK (("char_length"("initial_snapshot_hash") = 64)),
    CONSTRAINT "listing_watchers_journey_key_check" CHECK ((("journey_key" IS NULL) OR ("char_length"("journey_key") = 64))),
    CONSTRAINT "listing_watchers_last_notified_snapshot_hash_check" CHECK ((("last_notified_snapshot_hash" IS NULL) OR ("char_length"("last_notified_snapshot_hash") = 64))),
    CONSTRAINT "listing_watchers_referrer_host_check" CHECK ((("referrer_host" IS NULL) OR ("char_length"("referrer_host") <= 255))),
    CONSTRAINT "listing_watchers_source_context_check" CHECK (("source_context" = 'listing_detail'::"text")),
    CONSTRAINT "listing_watchers_status_check" CHECK (("status" = ANY (ARRAY['PENDING_CONFIRMATION'::"text", 'ACTIVE'::"text", 'UNSUBSCRIBED'::"text", 'BLOCKED'::"text", 'LISTING_CLOSED'::"text"]))),
    CONSTRAINT "listing_watchers_submission_key_check" CHECK ((("submission_key" IS NULL) OR ("char_length"("submission_key") = 64))),
    CONSTRAINT "listing_watchers_utm_campaign_check" CHECK ((("utm_campaign" IS NULL) OR ("char_length"("utm_campaign") <= 120))),
    CONSTRAINT "listing_watchers_utm_medium_check" CHECK ((("utm_medium" IS NULL) OR ("char_length"("utm_medium") <= 120))),
    CONSTRAINT "listing_watchers_utm_source_check" CHECK ((("utm_source" IS NULL) OR ("char_length"("utm_source") <= 120)))
);


ALTER TABLE "public"."listing_watchers" OWNER TO "postgres";


COMMENT ON TABLE "public"."listing_watchers" IS 'Private double-opt-in buyer interest in one listing. It is not an enquiry, reservation, payment or marketing subscription.';



COMMENT ON COLUMN "public"."listing_watchers"."closed_at" IS 'Terminal time after the watched listing becomes SOLD or ARCHIVED. ACTIVE is retained until the final requested operational update is provider-accepted.';



CREATE TABLE IF NOT EXISTS "public"."listings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "price" numeric NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "condition" "text" NOT NULL,
    "location_country" "text" NOT NULL,
    "contact_email" "text" NOT NULL,
    "contact_phone" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'DRAFT'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "public_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "instagram_posted" boolean DEFAULT false,
    "facebook_posted" boolean DEFAULT false,
    "social_last_posted_at" timestamp with time zone,
    CONSTRAINT "listings_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'PENDING_PAYMENT'::"text", 'ACTIVE_PREMIUM'::"text", 'ACTIVE_PUBLIC'::"text", 'SOLD'::"text", 'ARCHIVED'::"text", 'FLAGGED'::"text"])))
);


ALTER TABLE "public"."listings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."listings"."instagram_posted" IS 'Legacy marker for whether the listing has ever been published to Instagram.';



COMMENT ON COLUMN "public"."listings"."facebook_posted" IS 'Legacy marker for whether the listing has ever been published to the AeroTrade Facebook Page.';



COMMENT ON COLUMN "public"."listings"."social_last_posted_at" IS 'Tracks the last time this listing was included in the rotating daily social publishing queue.';



CREATE TABLE IF NOT EXISTS "public"."marketplace_inquiries" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "buyer_user_id" "uuid",
    "buyer_name" "text" NOT NULL,
    "buyer_email" "text" NOT NULL,
    "buyer_phone" "text",
    "message" "text" NOT NULL,
    "source" "text" DEFAULT 'listing_form'::"text" NOT NULL,
    "status" "text" DEFAULT 'NEW'::"text" NOT NULL,
    "seller_notification_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "seller_notification_provider_id" "text",
    "seller_notification_error" "text",
    "last_activity_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "journey_key" "text",
    "referrer_host" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "initial_offer_amount_minor" bigint,
    CONSTRAINT "marketplace_inquiries_buyer_email_check" CHECK ((("char_length"("buyer_email") >= 5) AND ("char_length"("buyer_email") <= 320))),
    CONSTRAINT "marketplace_inquiries_buyer_name_check" CHECK ((("char_length"("buyer_name") >= 2) AND ("char_length"("buyer_name") <= 120))),
    CONSTRAINT "marketplace_inquiries_buyer_phone_check" CHECK ((("buyer_phone" IS NULL) OR ("char_length"("buyer_phone") <= 60))),
    CONSTRAINT "marketplace_inquiries_currency_check" CHECK (("currency" = ANY (ARRAY['EUR'::"text", 'GBP'::"text", 'USD'::"text"]))),
    CONSTRAINT "marketplace_inquiries_initial_offer_check" CHECK ((("initial_offer_amount_minor" IS NULL) OR ("initial_offer_amount_minor" > 0))),
    CONSTRAINT "marketplace_inquiries_journey_key_length" CHECK ((("journey_key" IS NULL) OR ("char_length"("journey_key") = 64))),
    CONSTRAINT "marketplace_inquiries_message_check" CHECK ((("char_length"("message") >= 20) AND ("char_length"("message") <= 2000))),
    CONSTRAINT "marketplace_inquiries_referrer_host_length" CHECK ((("referrer_host" IS NULL) OR ("char_length"("referrer_host") <= 255))),
    CONSTRAINT "marketplace_inquiries_seller_notification_status_check" CHECK (("seller_notification_status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'failed'::"text", 'not_required'::"text"]))),
    CONSTRAINT "marketplace_inquiries_source_check" CHECK (("source" = ANY (ARRAY['listing_form'::"text", 'admin'::"text", 'import'::"text"]))),
    CONSTRAINT "marketplace_inquiries_status_check" CHECK (("status" = ANY (ARRAY['NEW'::"text", 'SELLER_NOTIFIED'::"text", 'CONTACTED'::"text", 'QUALIFIED'::"text", 'NEGOTIATING'::"text", 'WON'::"text", 'LOST'::"text", 'SPAM'::"text"]))),
    CONSTRAINT "marketplace_inquiries_utm_campaign_length" CHECK ((("utm_campaign" IS NULL) OR ("char_length"("utm_campaign") <= 120))),
    CONSTRAINT "marketplace_inquiries_utm_medium_length" CHECK ((("utm_medium" IS NULL) OR ("char_length"("utm_medium") <= 120))),
    CONSTRAINT "marketplace_inquiries_utm_source_length" CHECK ((("utm_source" IS NULL) OR ("char_length"("utm_source") <= 120)))
);


ALTER TABLE "public"."marketplace_inquiries" OWNER TO "postgres";


COMMENT ON COLUMN "public"."marketplace_inquiries"."journey_key" IS 'Daily server-HMAC journey key linking consented conversion to acquisition without a raw visitor identifier.';



COMMENT ON COLUMN "public"."marketplace_inquiries"."initial_offer_amount_minor" IS 'Optional buyer price indication in minor units; expressly non-binding.';



CREATE TABLE IF NOT EXISTS "public"."marketplace_inquiry_offer_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "inquiry_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_role" "text" NOT NULL,
    "actor_user_id" "uuid",
    "amount_minor" bigint,
    "currency" "text" NOT NULL,
    "note" "text",
    "buyer_notification_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "buyer_notification_provider_id" "text",
    "buyer_notification_error" "text",
    "idempotency_key" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "responding_to_event_id" "uuid",
    "seller_notification_status" "text" DEFAULT 'not_required'::"text" NOT NULL,
    "seller_notification_provider_id" "text",
    "seller_notification_error" "text",
    CONSTRAINT "marketplace_inquiry_offer_actor_consistency" CHECK (((("event_type" = ANY (ARRAY['BUYER_OFFERED'::"text", 'BUYER_ACCEPTED_FOR_NEGOTIATION'::"text", 'BUYER_COUNTERED'::"text", 'BUYER_DECLINED'::"text"])) AND ("actor_role" = 'BUYER'::"text")) OR (("event_type" = ANY (ARRAY['SELLER_ACCEPTED_FOR_NEGOTIATION'::"text", 'SELLER_COUNTERED'::"text", 'SELLER_DECLINED'::"text"])) AND ("actor_role" = ANY (ARRAY['SELLER'::"text", 'ADMIN'::"text"]))))),
    CONSTRAINT "marketplace_inquiry_offer_amount_consistency" CHECK (((("event_type" = ANY (ARRAY['BUYER_OFFERED'::"text", 'BUYER_COUNTERED'::"text", 'SELLER_COUNTERED'::"text"])) AND ("amount_minor" > 0)) OR (("event_type" = ANY (ARRAY['BUYER_ACCEPTED_FOR_NEGOTIATION'::"text", 'BUYER_DECLINED'::"text", 'SELLER_ACCEPTED_FOR_NEGOTIATION'::"text", 'SELLER_DECLINED'::"text"])) AND ("amount_minor" IS NULL)))),
    CONSTRAINT "marketplace_inquiry_offer_event_buyer_notification_status_check" CHECK (("buyer_notification_status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'failed'::"text", 'not_required'::"text"]))),
    CONSTRAINT "marketplace_inquiry_offer_events_actor_role_check" CHECK (("actor_role" = ANY (ARRAY['BUYER'::"text", 'SELLER'::"text", 'ADMIN'::"text"]))),
    CONSTRAINT "marketplace_inquiry_offer_events_currency_check" CHECK (("currency" = ANY (ARRAY['EUR'::"text", 'GBP'::"text", 'USD'::"text"]))),
    CONSTRAINT "marketplace_inquiry_offer_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['BUYER_OFFERED'::"text", 'BUYER_ACCEPTED_FOR_NEGOTIATION'::"text", 'BUYER_COUNTERED'::"text", 'BUYER_DECLINED'::"text", 'SELLER_ACCEPTED_FOR_NEGOTIATION'::"text", 'SELLER_COUNTERED'::"text", 'SELLER_DECLINED'::"text"]))),
    CONSTRAINT "marketplace_inquiry_offer_events_note_check" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 1000))),
    CONSTRAINT "marketplace_inquiry_offer_events_seller_notification_status_che" CHECK (("seller_notification_status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'failed'::"text", 'not_required'::"text"]))),
    CONSTRAINT "marketplace_inquiry_offer_response_target_consistency" CHECK (((("event_type" = ANY (ARRAY['BUYER_ACCEPTED_FOR_NEGOTIATION'::"text", 'BUYER_COUNTERED'::"text", 'BUYER_DECLINED'::"text"])) AND ("responding_to_event_id" IS NOT NULL) AND ("seller_notification_status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'failed'::"text"])) AND ("buyer_notification_status" = 'not_required'::"text")) OR (("event_type" <> ALL (ARRAY['BUYER_ACCEPTED_FOR_NEGOTIATION'::"text", 'BUYER_COUNTERED'::"text", 'BUYER_DECLINED'::"text"])) AND ("responding_to_event_id" IS NULL) AND ("seller_notification_status" = 'not_required'::"text"))))
);


ALTER TABLE "public"."marketplace_inquiry_offer_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."marketplace_inquiry_offer_events" IS 'Private non-binding negotiation evidence. It never reserves equipment, executes payment or forms a sale contract.';



CREATE TABLE IF NOT EXISTS "public"."new_balloon_quote_proposals" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "quote_request_id" "uuid" NOT NULL,
    "proposal_fingerprint" "text" NOT NULL,
    "manufacturer" "text" NOT NULL,
    "currency" "text" NOT NULL,
    "amount_min_minor" bigint NOT NULL,
    "amount_max_minor" bigint NOT NULL,
    "configuration_summary" "text" NOT NULL,
    "delivery_guidance" "text" NOT NULL,
    "valid_until" "date" NOT NULL,
    "terms" "text",
    "delivery_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "provider_message_id" "text",
    "delivery_error" "text",
    "recorded_by" "uuid" NOT NULL,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "new_balloon_quote_proposals_amount_min_minor_check" CHECK (("amount_min_minor" > 0)),
    CONSTRAINT "new_balloon_quote_proposals_check" CHECK (("amount_max_minor" >= "amount_min_minor")),
    CONSTRAINT "new_balloon_quote_proposals_check1" CHECK ((("delivery_status" = 'accepted'::"text") = ("accepted_at" IS NOT NULL))),
    CONSTRAINT "new_balloon_quote_proposals_check2" CHECK ((("delivery_status" <> 'accepted'::"text") OR ("provider_message_id" IS NOT NULL))),
    CONSTRAINT "new_balloon_quote_proposals_configuration_summary_check" CHECK ((("char_length"("configuration_summary") >= 20) AND ("char_length"("configuration_summary") <= 2000))),
    CONSTRAINT "new_balloon_quote_proposals_currency_check" CHECK (("currency" = ANY (ARRAY['EUR'::"text", 'GBP'::"text", 'USD'::"text"]))),
    CONSTRAINT "new_balloon_quote_proposals_delivery_guidance_check" CHECK ((("char_length"("delivery_guidance") >= 5) AND ("char_length"("delivery_guidance") <= 500))),
    CONSTRAINT "new_balloon_quote_proposals_delivery_status_check" CHECK (("delivery_status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'failed'::"text"]))),
    CONSTRAINT "new_balloon_quote_proposals_manufacturer_check" CHECK (("manufacturer" = ANY (ARRAY['pasha'::"text", 'schroeder'::"text"]))),
    CONSTRAINT "new_balloon_quote_proposals_proposal_fingerprint_check" CHECK (("char_length"("proposal_fingerprint") = 64)),
    CONSTRAINT "new_balloon_quote_proposals_terms_check" CHECK ((("terms" IS NULL) OR ("char_length"("terms") <= 2000)))
);


ALTER TABLE "public"."new_balloon_quote_proposals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."newsletter_recipients" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "status" "text" NOT NULL,
    "resend_id" "text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "newsletter_recipients_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."newsletter_recipients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."newsletter_recovery_recipients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recovery_run_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "status" "text" NOT NULL,
    "resend_id" "text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "newsletter_recovery_recipients_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."newsletter_recovery_recipients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."newsletter_recovery_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "original_run_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "dry_run" boolean DEFAULT false NOT NULL,
    "reason" "text" NOT NULL,
    "expected_failed_count" integer NOT NULL,
    "recipient_count" integer DEFAULT 0 NOT NULL,
    "sent_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "content_sha256" "text" NOT NULL,
    "provider_dispatch_started_at" timestamp with time zone,
    "resend_message_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "newsletter_recovery_runs_expected_failed_count_check" CHECK (("expected_failed_count" > 0)),
    CONSTRAINT "newsletter_recovery_runs_failed_count_check" CHECK (("failed_count" >= 0)),
    CONSTRAINT "newsletter_recovery_runs_recipient_count_check" CHECK (("recipient_count" >= 0)),
    CONSTRAINT "newsletter_recovery_runs_sent_count_check" CHECK (("sent_count" >= 0)),
    CONSTRAINT "newsletter_recovery_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'sent'::"text", 'partial'::"text", 'failed'::"text", 'audit_uncertain'::"text", 'abandoned'::"text"])))
);


ALTER TABLE "public"."newsletter_recovery_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."newsletter_runs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "period_key" "text" NOT NULL,
    "trigger_source" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "dry_run" boolean DEFAULT false NOT NULL,
    "test_email" "text",
    "days_filter" integer,
    "mix_with_latest" boolean DEFAULT false NOT NULL,
    "started_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "completed_at" timestamp with time zone,
    "recipients_count" integer DEFAULT 0 NOT NULL,
    "sent_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "skipped_invalid_recipients" integer DEFAULT 0 NOT NULL,
    "listings_count" integer DEFAULT 0 NOT NULL,
    "primary_listing_count" integer DEFAULT 0 NOT NULL,
    "upgraded_expired_premium_listings" integer DEFAULT 0 NOT NULL,
    "would_upgrade_expired_premium_listings" integer DEFAULT 0 NOT NULL,
    "listing_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "resend_message_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "subject" "text",
    "html_body" "text",
    "content_sha256" "text",
    "provider_dispatch_started_at" timestamp with time zone,
    CONSTRAINT "newsletter_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'sent'::"text", 'partial'::"text", 'failed'::"text", 'skipped'::"text", 'audit_uncertain'::"text"]))),
    CONSTRAINT "newsletter_runs_trigger_source_check" CHECK (("trigger_source" = ANY (ARRAY['schedule'::"text", 'manual'::"text", 'workflow_dispatch'::"text", 'test'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."newsletter_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_notification_receipts" (
    "charge_id" "text" NOT NULL,
    "stripe_event_id" "text" NOT NULL,
    "payment_intent_id" "text",
    "invoice_id" "text",
    "subscription_id" "text",
    "amount_minor" bigint NOT NULL,
    "currency" "text" NOT NULL,
    "payment_type" "text" NOT NULL,
    "product_label" "text" NOT NULL,
    "livemode" boolean NOT NULL,
    "provider_message_id" "text" NOT NULL,
    "accepted_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "payment_notification_receipts_amount_minor_check" CHECK (("amount_minor" >= 0)),
    CONSTRAINT "payment_notification_receipts_currency_check" CHECK (("currency" ~ '^[a-z]{3}$'::"text")),
    CONSTRAINT "payment_notification_receipts_payment_type_check" CHECK (("payment_type" = ANY (ARRAY['listing_fee'::"text", 'premium_subscription'::"text", 'other'::"text"]))),
    CONSTRAINT "payment_notification_receipts_product_label_check" CHECK ((("char_length"("product_label") >= 1) AND ("char_length"("product_label") <= 500))),
    CONSTRAINT "payment_notification_receipts_provider_message_id_check" CHECK ((("char_length"("provider_message_id") >= 1) AND ("char_length"("provider_message_id") <= 255)))
);


ALTER TABLE "public"."payment_notification_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."premium_alert_recipients" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "status" "text" NOT NULL,
    "resend_id" "text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "premium_alert_recipients_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."premium_alert_recipients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."premium_alert_runs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "completed_at" timestamp with time zone,
    "recipients_count" integer DEFAULT 0 NOT NULL,
    "sent_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "skipped_invalid_recipients" integer DEFAULT 0 NOT NULL,
    "resend_message_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "premium_alert_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'sent'::"text", 'partial'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."premium_alert_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."premium_checkout_intents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stripe_session_id" "text" NOT NULL,
    "source" "text" NOT NULL,
    "status" "text" DEFAULT 'STARTED'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "premium_checkout_intents_source_check" CHECK (("source" = ANY (ARRAY['signup'::"text", 'pricing'::"text", 'dashboard'::"text", 'admin'::"text", 'historical'::"text"]))),
    CONSTRAINT "premium_checkout_intents_status_check" CHECK (("status" = ANY (ARRAY['STARTED'::"text", 'COMPLETED'::"text", 'EXPIRED'::"text", 'SUPERSEDED'::"text"])))
);


ALTER TABLE "public"."premium_checkout_intents" OWNER TO "postgres";


COMMENT ON TABLE "public"."premium_checkout_intents" IS 'Private recovery ledger for Premium checkout attempts. It stores no card data, checkout URL or free text.';



CREATE TABLE IF NOT EXISTS "public"."quote_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "country" "text",
    "manufacturer_preference" "text",
    "equipment_type" "text" NOT NULL,
    "volume_or_capacity" "text",
    "intended_use" "text",
    "budget_range" "text",
    "timeline" "text",
    "colors_or_branding" "text",
    "notes" "text",
    "status" "text" DEFAULT 'NEW'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "source_context" "text" DEFAULT 'direct'::"text" NOT NULL,
    "requested_category" "text",
    "requested_equipment" "text",
    "requested_country" "text",
    "privacy_consent_at" timestamp with time zone,
    "submission_key" "text",
    "journey_key" "text",
    "referrer_host" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    CONSTRAINT "quote_requests_journey_key_length" CHECK ((("journey_key" IS NULL) OR ("char_length"("journey_key") = 64))),
    CONSTRAINT "quote_requests_referrer_host_length" CHECK ((("referrer_host" IS NULL) OR ("char_length"("referrer_host") <= 255))),
    CONSTRAINT "quote_requests_requested_category_check" CHECK ((("requested_category" IS NULL) OR ("requested_category" = ANY (ARRAY['complete'::"text", 'envelopes'::"text", 'baskets'::"text", 'burners'::"text", 'bottom-end'::"text", 'cylinders'::"text", 'other-equipment'::"text"])))),
    CONSTRAINT "quote_requests_source_context_check" CHECK (("source_context" = ANY (ARRAY['direct'::"text", 'navigation'::"text", 'home'::"text", 'catalog'::"text", 'catalog-empty'::"text", 'listing'::"text", 'wanted'::"text", 'about'::"text", 'contact'::"text"]))),
    CONSTRAINT "quote_requests_status_check" CHECK (("status" = ANY (ARRAY['NEW'::"text", 'CONTACTED'::"text", 'SENT_TO_PARTNER'::"text", 'QUOTE_SENT'::"text", 'WON'::"text", 'LOST'::"text"]))),
    CONSTRAINT "quote_requests_utm_campaign_length" CHECK ((("utm_campaign" IS NULL) OR ("char_length"("utm_campaign") <= 120))),
    CONSTRAINT "quote_requests_utm_medium_length" CHECK ((("utm_medium" IS NULL) OR ("char_length"("utm_medium") <= 120))),
    CONSTRAINT "quote_requests_utm_source_length" CHECK ((("utm_source" IS NULL) OR ("char_length"("utm_source") <= 120)))
);


ALTER TABLE "public"."quote_requests" OWNER TO "postgres";


COMMENT ON COLUMN "public"."quote_requests"."source_context" IS 'Bounded commercial entry point for the new-balloon lead; includes marketplace, positioning and contact paths without retaining a URL, identifier or personal data.';



COMMENT ON COLUMN "public"."quote_requests"."requested_equipment" IS 'Bounded, contact-free demand context voluntarily carried from a catalog search.';



COMMENT ON COLUMN "public"."quote_requests"."privacy_consent_at" IS 'Timestamp at which the buyer explicitly asked AeroTrade to respond to the quotation request.';



COMMENT ON COLUMN "public"."quote_requests"."submission_key" IS 'HMAC-based abuse-control key; never stores an IP address or raw browser identifier.';



COMMENT ON COLUMN "public"."quote_requests"."journey_key" IS 'Daily server-HMAC journey key linking a consented new-balloon lead to acquisition without a raw visitor identifier.';



CREATE TABLE IF NOT EXISTS "public"."seller_assistance_requests" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "seller_user_id" "uuid",
    "linked_listing_id" "uuid",
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "category" "text" NOT NULL,
    "manufacturer" "text",
    "model" "text",
    "manufacture_year" integer,
    "location_country" "text",
    "expected_price_minor" bigint,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "documentation_readiness" "text" DEFAULT 'UNKNOWN'::"text" NOT NULL,
    "photo_readiness" "text" DEFAULT 'UNKNOWN'::"text" NOT NULL,
    "timeline" "text" DEFAULT 'EXPLORING'::"text" NOT NULL,
    "help_needed" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "notes" "text",
    "source_context" "text" DEFAULT 'direct'::"text" NOT NULL,
    "status" "text" DEFAULT 'NEW'::"text" NOT NULL,
    "privacy_consent_at" timestamp with time zone NOT NULL,
    "submission_key" "text",
    "journey_key" "text",
    "referrer_host" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "last_activity_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "existing_listing_url" "text",
    CONSTRAINT "seller_assistance_closed_state" CHECK (((("status" = ANY (ARRAY['CLOSED'::"text", 'SPAM'::"text"])) AND ("closed_at" IS NOT NULL)) OR (("status" <> ALL (ARRAY['CLOSED'::"text", 'SPAM'::"text"])) AND ("closed_at" IS NULL)))),
    CONSTRAINT "seller_assistance_existing_listing_url_check" CHECK ((("existing_listing_url" IS NULL) OR (("char_length"("existing_listing_url") <= 1000) AND ("existing_listing_url" ~* '^https?://'::"text")))),
    CONSTRAINT "seller_assistance_listed_link" CHECK ((("status" <> 'LISTED'::"text") OR ("linked_listing_id" IS NOT NULL))),
    CONSTRAINT "seller_assistance_requests_category_check" CHECK (("category" = ANY (ARRAY['complete'::"text", 'envelopes'::"text", 'baskets'::"text", 'burners'::"text", 'bottom-end'::"text", 'cylinders'::"text", 'other-equipment'::"text"]))),
    CONSTRAINT "seller_assistance_requests_currency_check" CHECK (("currency" = ANY (ARRAY['EUR'::"text", 'GBP'::"text", 'USD'::"text"]))),
    CONSTRAINT "seller_assistance_requests_documentation_readiness_check" CHECK (("documentation_readiness" = ANY (ARRAY['READY'::"text", 'PARTIAL'::"text", 'NOT_READY'::"text", 'UNKNOWN'::"text"]))),
    CONSTRAINT "seller_assistance_requests_email_check" CHECK ((("char_length"("email") >= 3) AND ("char_length"("email") <= 320))),
    CONSTRAINT "seller_assistance_requests_expected_price_minor_check" CHECK ((("expected_price_minor" IS NULL) OR ("expected_price_minor" >= 0))),
    CONSTRAINT "seller_assistance_requests_help_needed_check" CHECK (("help_needed" <@ ARRAY['VALUATION'::"text", 'LISTING_PREPARATION'::"text", 'PHOTO_GUIDANCE'::"text", 'DOCUMENT_CHECK'::"text"])),
    CONSTRAINT "seller_assistance_requests_journey_key_check" CHECK ((("journey_key" IS NULL) OR ("char_length"("journey_key") = 64))),
    CONSTRAINT "seller_assistance_requests_location_country_check" CHECK ((("location_country" IS NULL) OR ("char_length"("location_country") <= 100))),
    CONSTRAINT "seller_assistance_requests_manufacture_year_check" CHECK ((("manufacture_year" IS NULL) OR (("manufacture_year" >= 1900) AND ("manufacture_year" <= 2200)))),
    CONSTRAINT "seller_assistance_requests_manufacturer_check" CHECK ((("manufacturer" IS NULL) OR ("char_length"("manufacturer") <= 120))),
    CONSTRAINT "seller_assistance_requests_model_check" CHECK ((("model" IS NULL) OR ("char_length"("model") <= 120))),
    CONSTRAINT "seller_assistance_requests_name_check" CHECK ((("char_length"("name") >= 2) AND ("char_length"("name") <= 120))),
    CONSTRAINT "seller_assistance_requests_notes_check" CHECK ((("notes" IS NULL) OR ("char_length"("notes") <= 2000))),
    CONSTRAINT "seller_assistance_requests_phone_check" CHECK ((("phone" IS NULL) OR ("char_length"("phone") <= 60))),
    CONSTRAINT "seller_assistance_requests_photo_readiness_check" CHECK (("photo_readiness" = ANY (ARRAY['READY'::"text", 'PARTIAL'::"text", 'NOT_READY'::"text", 'UNKNOWN'::"text"]))),
    CONSTRAINT "seller_assistance_requests_referrer_host_check" CHECK ((("referrer_host" IS NULL) OR ("char_length"("referrer_host") <= 255))),
    CONSTRAINT "seller_assistance_requests_source_context_check" CHECK (("source_context" = ANY (ARRAY['sell_assisted'::"text", 'direct'::"text", 'navigation'::"text", 'home'::"text", 'dashboard'::"text", 'catalog_empty'::"text", 'seller_seo'::"text", 'sell_gateway'::"text", 'assisted_conversion'::"text"]))),
    CONSTRAINT "seller_assistance_requests_status_check" CHECK (("status" = ANY (ARRAY['NEW'::"text", 'CONTACTED'::"text", 'QUALIFIED'::"text", 'LISTING_PREPARATION'::"text", 'LISTED'::"text", 'CLOSED'::"text", 'SPAM'::"text"]))),
    CONSTRAINT "seller_assistance_requests_submission_key_check" CHECK ((("submission_key" IS NULL) OR ("char_length"("submission_key") = 64))),
    CONSTRAINT "seller_assistance_requests_timeline_check" CHECK (("timeline" = ANY (ARRAY['NOW'::"text", '0_3_MONTHS'::"text", '3_6_MONTHS'::"text", 'EXPLORING'::"text"]))),
    CONSTRAINT "seller_assistance_requests_utm_campaign_check" CHECK ((("utm_campaign" IS NULL) OR ("char_length"("utm_campaign") <= 120))),
    CONSTRAINT "seller_assistance_requests_utm_medium_check" CHECK ((("utm_medium" IS NULL) OR ("char_length"("utm_medium") <= 120))),
    CONSTRAINT "seller_assistance_requests_utm_source_check" CHECK ((("utm_source" IS NULL) OR ("char_length"("utm_source") <= 120)))
);


ALTER TABLE "public"."seller_assistance_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."seller_assistance_requests" IS 'Private seller assistance leads; never published and never used to create a listing without the owner completing the normal listing workflow.';



COMMENT ON COLUMN "public"."seller_assistance_requests"."source_context" IS 'Closed, non-PII source of an assisted-sale request; no URL or campaign free text is retained here.';



COMMENT ON COLUMN "public"."seller_assistance_requests"."submission_key" IS 'One-way abuse-control key; contains no raw IP address or browser identifier.';



COMMENT ON COLUMN "public"."seller_assistance_requests"."journey_key" IS 'Daily server-HMAC attribution key; contains no raw visitor or user identifier.';



COMMENT ON COLUMN "public"."seller_assistance_requests"."existing_listing_url" IS 'Optional owner-supplied public advert URL for manual transfer review; never fetched or published automatically.';



CREATE TABLE IF NOT EXISTS "public"."seller_funnel_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "event_key" "text" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "listing_id" "uuid",
    "stage" "text" NOT NULL,
    "listing_plan" "text",
    "source" "text" DEFAULT 'web'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "entry_context" "text" DEFAULT 'system'::"text" NOT NULL,
    CONSTRAINT "seller_funnel_events_entry_context_check" CHECK (("entry_context" = ANY (ARRAY['system'::"text", 'direct'::"text", 'navigation'::"text", 'home'::"text", 'dashboard'::"text", 'catalog_empty'::"text", 'seller_seo'::"text", 'sell_gateway'::"text", 'assisted_conversion'::"text"]))),
    CONSTRAINT "seller_funnel_events_event_key_check" CHECK (("char_length"("event_key") = 64)),
    CONSTRAINT "seller_funnel_events_listing_plan_check" CHECK ((("listing_plan" IS NULL) OR ("listing_plan" = ANY (ARRAY['free'::"text", 'premium'::"text"])))),
    CONSTRAINT "seller_funnel_events_source_check" CHECK (("source" = ANY (ARRAY['web'::"text", 'stripe'::"text", 'recovery'::"text"]))),
    CONSTRAINT "seller_funnel_events_stage_check" CHECK (("stage" = ANY (ARRAY['SELL_PAGE_VIEWED'::"text", 'FORM_STARTED'::"text", 'LISTING_SUBMITTED'::"text", 'CHECKOUT_CREATED'::"text", 'CHECKOUT_RECOVERY_SENT'::"text", 'CHECKOUT_RESUMED'::"text", 'PAYMENT_CONFIRMED'::"text", 'LISTING_PUBLISHED'::"text"]))),
    CONSTRAINT "seller_funnel_listing_stage_consistency" CHECK (((("stage" = ANY (ARRAY['SELL_PAGE_VIEWED'::"text", 'FORM_STARTED'::"text"])) AND ("listing_id" IS NULL)) OR (("stage" = ANY (ARRAY['LISTING_SUBMITTED'::"text", 'CHECKOUT_CREATED'::"text", 'CHECKOUT_RECOVERY_SENT'::"text", 'CHECKOUT_RESUMED'::"text", 'PAYMENT_CONFIRMED'::"text", 'LISTING_PUBLISHED'::"text"])) AND ("listing_id" IS NOT NULL))))
);


ALTER TABLE "public"."seller_funnel_events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."seller_funnel_events"."entry_context" IS 'Closed, non-PII entry point used to measure which seller-acquisition path reaches publication.';



CREATE TABLE IF NOT EXISTS "public"."stripe_webhook_events" (
    "event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "stripe_created_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "attempts" integer DEFAULT 1 NOT NULL,
    "last_error" "text",
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "stripe_webhook_events_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'processed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."stripe_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'user'::"text",
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "is_premium" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "name" "text",
    "phone" "text",
    "premium_source" "text",
    "premium_granted_by" "uuid",
    "premium_granted_at" timestamp with time zone,
    "premium_revoked_at" timestamp with time zone,
    "premium_last_stripe_event_id" "text",
    CONSTRAINT "users_premium_source_check" CHECK (("premium_source" = ANY (ARRAY['stripe'::"text", 'admin'::"text", 'legacy'::"text"]))),
    CONSTRAINT "users_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vb_automation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'info'::"text" NOT NULL,
    "status" "text" DEFAULT 'ok'::"text" NOT NULL,
    "reservation_id" "text",
    "passenger_order" integer,
    "channel" "text",
    "subject" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error" "text"
);


ALTER TABLE "public"."vb_automation_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vb_automation_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stable_key" "text" NOT NULL,
    "task_type" "text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "reason" "text" NOT NULL,
    "reservation_id" "text",
    "passenger_order" integer,
    "due_at" timestamp with time zone,
    "assigned_to" "text",
    "source" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "resolved_at" timestamp with time zone
);


ALTER TABLE "public"."vb_automation_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vb_channel_price_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "departure_id" "uuid" NOT NULL,
    "quote_id" "uuid",
    "channel" "text" NOT NULL,
    "delivery_model" "text" NOT NULL,
    "price_basis" "text" NOT NULL,
    "product_code" "text" NOT NULL,
    "external_option_id" "text" NOT NULL,
    "external_product_id" "text",
    "pricing_category" "text" DEFAULT 'ADULT'::"text" NOT NULL,
    "currency" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "pricing_version" "text" NOT NULL,
    "effective_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'shadow'::"text" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "last_requested_at" timestamp with time zone,
    "last_served_at" timestamp with time zone,
    "last_provider_ack_at" timestamp with time zone,
    "last_error" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "vb_channel_price_snapshots_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "vb_channel_price_snapshots_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "vb_channel_price_snapshots_delivery_model_check" CHECK (("delivery_model" = ANY (ARRAY['pulled_by_channel'::"text", 'pushed_to_channel'::"text"]))),
    CONSTRAINT "vb_channel_price_snapshots_price_basis_check" CHECK (("price_basis" = ANY (ARRAY['retail'::"text", 'net_rate'::"text"]))),
    CONSTRAINT "vb_channel_price_snapshots_status_check" CHECK (("status" = ANY (ARRAY['shadow'::"text", 'ready'::"text", 'served'::"text", 'acknowledged'::"text", 'error'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."vb_channel_price_snapshots" OWNER TO "postgres";


COMMENT ON TABLE "public"."vb_channel_price_snapshots" IS 'Server-only latest desired channel prices. GetYourGuide consumes retail snapshots; Viator consumes net-rate snapshots.';



CREATE TABLE IF NOT EXISTS "public"."vb_compliance_items" (
    "id" "text" NOT NULL,
    "group_type" "text" NOT NULL,
    "owner_name" "text" NOT NULL,
    "document_name" "text" NOT NULL,
    "expires_at" "date" NOT NULL,
    CONSTRAINT "vb_compliance_items_group_type_check" CHECK (("group_type" = ANY (ARRAY['balloons'::"text", 'pilots'::"text", 'audits'::"text"])))
);


ALTER TABLE "public"."vb_compliance_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vb_consent_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reservation_id" "text" NOT NULL,
    "passenger_order" integer NOT NULL,
    "token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "signed_at" timestamp with time zone,
    "signer_name" "text",
    "signature_data_url" "text",
    "document_url" "text",
    "ip_address" "text",
    "user_agent" "text",
    "evidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."vb_consent_tokens" OWNER TO "postgres";


COMMENT ON TABLE "public"."vb_consent_tokens" IS 'Server-only evidence records for passenger declarations. Public access is only through one-time application tokens.';



CREATE TABLE IF NOT EXISTS "public"."vb_departures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "destination_code" "text" NOT NULL,
    "flight_date" "date" NOT NULL,
    "flight_time" time without time zone NOT NULL,
    "availability_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "sellable_capacity" integer NOT NULL,
    "pricing_mode" "text" DEFAULT 'shadow'::"text" NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "manual_classic_price" numeric(10,2),
    "pricing_version" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sandbox" boolean DEFAULT false NOT NULL,
    CONSTRAINT "vb_departures_availability_status_check" CHECK (("availability_status" = ANY (ARRAY['draft'::"text", 'open'::"text", 'closed'::"text", 'cancelled'::"text", 'weather_hold'::"text"]))),
    CONSTRAINT "vb_departures_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "vb_departures_manual_classic_price_check" CHECK ((("manual_classic_price" IS NULL) OR ("manual_classic_price" >= (0)::numeric))),
    CONSTRAINT "vb_departures_pricing_mode_check" CHECK (("pricing_mode" = ANY (ARRAY['disabled'::"text", 'shadow'::"text", 'manual'::"text", 'automatic'::"text"]))),
    CONSTRAINT "vb_departures_sellable_capacity_check" CHECK ((("sellable_capacity" >= 1) AND ("sellable_capacity" <= 200)))
);


ALTER TABLE "public"."vb_departures" OWNER TO "postgres";


COMMENT ON TABLE "public"."vb_departures" IS 'Server-only departure inventory and pricing mode. New departures default to non-publishing shadow mode.';



CREATE TABLE IF NOT EXISTS "public"."vb_flight_attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stable_key" "text" NOT NULL,
    "flight_date" "date" NOT NULL,
    "reservation_id" "text" NOT NULL,
    "passenger_order" integer NOT NULL,
    "passenger_name" "text" NOT NULL,
    "weight_kg" numeric(6,2),
    "source" "text" NOT NULL,
    "status" "text" DEFAULT 'present'::"text" NOT NULL,
    "evidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "vb_flight_attendance_source_check" CHECK (("source" = ANY (ARRAY['scheduled'::"text", 'walk_in'::"text"]))),
    CONSTRAINT "vb_flight_attendance_status_check" CHECK (("status" = ANY (ARRAY['present'::"text", 'absent'::"text"])))
);


ALTER TABLE "public"."vb_flight_attendance" OWNER TO "postgres";


COMMENT ON TABLE "public"."vb_flight_attendance" IS 'Server-only attendance overrides and walk-in passengers for the declaration kiosk.';



CREATE TABLE IF NOT EXISTS "public"."vb_flight_signature_clearances" (
    "flight_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cleared_at" timestamp with time zone NOT NULL,
    "manifest_hash" "text" NOT NULL,
    "present_count" integer NOT NULL,
    "signed_count" integer NOT NULL,
    "evidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."vb_flight_signature_clearances" OWNER TO "postgres";


COMMENT ON TABLE "public"."vb_flight_signature_clearances" IS 'Server-verified flight departure clearance bound to the exact signed passenger manifest.';



CREATE TABLE IF NOT EXISTS "public"."vb_gift_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "code" "text" NOT NULL,
    "reservation_id" "text",
    "buyer_name" "text",
    "buyer_email" "text",
    "recipient_name" "text",
    "passenger_count" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'issued'::"text" NOT NULL,
    "expires_at" "date",
    "redeemed_reservation_id" "text",
    "redeemed_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "notes" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."vb_gift_tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vb_inventory_holds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "departure_id" "uuid" NOT NULL,
    "quote_id" "uuid",
    "channel" "text" NOT NULL,
    "external_reference" "text",
    "seats" integer NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "vb_inventory_holds_seats_check" CHECK ((("seats" >= 1) AND ("seats" <= 200))),
    CONSTRAINT "vb_inventory_holds_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'converted'::"text", 'released'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."vb_inventory_holds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vb_message_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "text",
    "type" "text" NOT NULL,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "target_date" "date",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "planned" integer DEFAULT 0 NOT NULL,
    "sent" integer DEFAULT 0 NOT NULL,
    "delivered" integer DEFAULT 0 NOT NULL,
    "read" integer DEFAULT 0 NOT NULL,
    "failed" integer DEFAULT 0 NOT NULL,
    "pending" integer DEFAULT 0 NOT NULL,
    "skipped" integer DEFAULT 0 NOT NULL,
    "summary" "text",
    "error" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."vb_message_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vb_message_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reservation_id" "text",
    "passenger_order" integer,
    "channel" "text" NOT NULL,
    "direction" "text" DEFAULT 'outbound'::"text" NOT NULL,
    "message_type" "text" NOT NULL,
    "recipient" "text" NOT NULL,
    "subject" "text",
    "status" "text" NOT NULL,
    "provider" "text",
    "provider_message_id" "text",
    "template" "text",
    "error" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "campaign_id" "uuid",
    "provider_status" "text",
    "accepted_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "fallback_channel" "text",
    "fallback_status" "text",
    "last_webhook_at" timestamp with time zone,
    "raw_webhook" "jsonb",
    "conversation_id" "uuid",
    "actor_type" "text",
    "actor_name" "text",
    "needs_human" boolean,
    "intent" "text",
    "automation_rule_version" "text",
    "idempotency_key" "text"
);


ALTER TABLE "public"."vb_message_log" OWNER TO "postgres";


COMMENT ON COLUMN "public"."vb_message_log"."idempotency_key" IS 'Stable provider idempotency key for exactly-once outbound delivery.';



CREATE TABLE IF NOT EXISTS "public"."vb_meta" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL
);


ALTER TABLE "public"."vb_meta" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vb_price_quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "departure_id" "uuid" NOT NULL,
    "pricing_version" "text" NOT NULL,
    "channel" "text" DEFAULT 'dashboard'::"text" NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "party_size" integer NOT NULL,
    "confirmed_seats" integer NOT NULL,
    "held_seats" integer NOT NULL,
    "projected_occupancy" numeric(8,6) NOT NULL,
    "occupancy_tier" "text" NOT NULL,
    "multiplier" numeric(12,8) NOT NULL,
    "classic_unit_price" numeric(10,2) NOT NULL,
    "comfort_unit_price" numeric(10,2) NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'quoted'::"text" NOT NULL,
    "request_context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "vb_price_quotes_classic_unit_price_check" CHECK (("classic_unit_price" > (0)::numeric)),
    CONSTRAINT "vb_price_quotes_comfort_unit_price_check" CHECK (("comfort_unit_price" > (0)::numeric)),
    CONSTRAINT "vb_price_quotes_confirmed_seats_check" CHECK (("confirmed_seats" >= 0)),
    CONSTRAINT "vb_price_quotes_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "vb_price_quotes_held_seats_check" CHECK (("held_seats" >= 0)),
    CONSTRAINT "vb_price_quotes_multiplier_check" CHECK (("multiplier" > (0)::numeric)),
    CONSTRAINT "vb_price_quotes_party_size_check" CHECK ((("party_size" >= 1) AND ("party_size" <= 200))),
    CONSTRAINT "vb_price_quotes_projected_occupancy_check" CHECK ((("projected_occupancy" >= (0)::numeric) AND ("projected_occupancy" <= (1)::numeric))),
    CONSTRAINT "vb_price_quotes_status_check" CHECK (("status" = ANY (ARRAY['quoted'::"text", 'held'::"text", 'converted'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."vb_price_quotes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vb_pricing_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "departure_id" "uuid",
    "quote_id" "uuid",
    "event_type" "text" NOT NULL,
    "actor" "text" DEFAULT 'system'::"text" NOT NULL,
    "channel" "text",
    "idempotency_key" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."vb_pricing_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."vb_pricing_events" IS 'Immutable operational audit trail for price decisions and channel synchronization attempts.';



CREATE TABLE IF NOT EXISTS "public"."vb_pricing_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "destination_code" "text" NOT NULL,
    "version" "text" NOT NULL,
    "active" boolean DEFAULT false NOT NULL,
    "configuration" "jsonb" NOT NULL
);


ALTER TABLE "public"."vb_pricing_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vb_rate_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "destination_code" "text" NOT NULL,
    "product_code" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "base_price" numeric(10,2) NOT NULL,
    "floor_price" numeric(10,2) NOT NULL,
    "ceiling_price" numeric(10,2) NOT NULL,
    "anchor_product_code" "text",
    "anchor_ratio" numeric(12,8),
    "rounding_increment" numeric(10,2) DEFAULT 1 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "vb_rate_plans_anchor_ratio_check" CHECK ((("anchor_ratio" IS NULL) OR ("anchor_ratio" > (0)::numeric))),
    CONSTRAINT "vb_rate_plans_base_price_check" CHECK (("base_price" > (0)::numeric)),
    CONSTRAINT "vb_rate_plans_check" CHECK (("ceiling_price" >= "floor_price")),
    CONSTRAINT "vb_rate_plans_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "vb_rate_plans_floor_price_check" CHECK (("floor_price" > (0)::numeric)),
    CONSTRAINT "vb_rate_plans_rounding_increment_check" CHECK (("rounding_increment" > (0)::numeric))
);


ALTER TABLE "public"."vb_rate_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vb_reservations" (
    "id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" NOT NULL,
    "flight_date" "date",
    "flight_time" "text" NOT NULL,
    "passengers" integer NOT NULL,
    "total_weight_kg" numeric NOT NULL,
    "lead_name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "email" "text" NOT NULL,
    "sale_source" "text" NOT NULL,
    "balloon_id" "text" NOT NULL,
    "google_calendar_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "google_calendar_event_id" "text" DEFAULT ''::"text" NOT NULL,
    "package_name" "text" NOT NULL,
    "pickup_location" "text" DEFAULT ''::"text" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "source_channel" "text",
    "external_ref" "text",
    "passenger_details" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "raw_passenger_text" "text" DEFAULT ''::"text" NOT NULL,
    "needs_review" boolean DEFAULT false NOT NULL,
    "manual_override_fields" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "last_imported_at" timestamp with time zone,
    "destination_code" "text",
    "product_code" "text",
    "unit_price_gross" numeric(10,2),
    "total_price_gross" numeric(10,2),
    "currency" "text",
    "channel_commission" numeric(10,2),
    "net_revenue" numeric(10,2),
    "price_quote_id" "uuid",
    "attribution" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "vb_reservations_attribution_object_check" CHECK (("jsonb_typeof"("attribution") = 'object'::"text")),
    CONSTRAINT "vb_reservations_confirmed_requires_flight_date" CHECK ((("status" <> 'confirmed'::"text") OR ("flight_date" IS NOT NULL))),
    CONSTRAINT "vb_reservations_pending_has_no_operational_date" CHECK ((("status" <> 'pending'::"text") OR ("flight_date" IS NULL) OR ("flight_date" = ANY (ARRAY['2099-12-31'::"date", '9999-12-31'::"date"])))),
    CONSTRAINT "vb_reservations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'cancelled'::"text", 'completed'::"text", 'open_gift'::"text"])))
);


ALTER TABLE "public"."vb_reservations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."vb_reservations"."flight_date" IS 'Null only while a non-confirmed reservation is waiting for a new flight date. Confirmed reservations require a real date.';



COMMENT ON COLUMN "public"."vb_reservations"."attribution" IS 'First-touch session attribution copied from the paid storefront checkout. Contains only allowlisted UTM fields, landing path and referrer host; never contact or passenger data.';



COMMENT ON CONSTRAINT "vb_reservations_pending_has_no_operational_date" ON "public"."vb_reservations" IS 'A pending reservation has no operational flight date. The 2099/9999 sentinels are legacy storage for open gift entitlements.';



CREATE TABLE IF NOT EXISTS "public"."vb_storefront_checkouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kind" "text" NOT NULL,
    "status" "text" DEFAULT 'awaiting_payment'::"text" NOT NULL,
    "sandbox" boolean DEFAULT true NOT NULL,
    "departure_id" "uuid",
    "quote_id" "uuid",
    "hold_id" "uuid",
    "redsys_order" "text" NOT NULL,
    "product_code" "text" NOT NULL,
    "party_size" integer NOT NULL,
    "amount_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "contact" "jsonb" NOT NULL,
    "passengers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "gift_recipient" "jsonb",
    "accepted_terms_at" timestamp with time zone NOT NULL,
    "paid_at" timestamp with time zone,
    "provider_response" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "reservation_id" "text",
    "error_code" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "vb_storefront_checkouts_amount_cents_check" CHECK (("amount_cents" > 0)),
    CONSTRAINT "vb_storefront_checkouts_check" CHECK (((("kind" = 'dated_flight'::"text") AND ("departure_id" IS NOT NULL) AND ("quote_id" IS NOT NULL) AND ("jsonb_array_length"("passengers") = "party_size")) OR (("kind" = 'open_gift'::"text") AND ("departure_id" IS NULL) AND ("quote_id" IS NULL) AND ("jsonb_array_length"("passengers") = 0)))),
    CONSTRAINT "vb_storefront_checkouts_currency_check" CHECK (("currency" = 'EUR'::"text")),
    CONSTRAINT "vb_storefront_checkouts_kind_check" CHECK (("kind" = ANY (ARRAY['dated_flight'::"text", 'open_gift'::"text"]))),
    CONSTRAINT "vb_storefront_checkouts_party_size_check" CHECK ((("party_size" >= 1) AND ("party_size" <= 200))),
    CONSTRAINT "vb_storefront_checkouts_redsys_order_check" CHECK (("redsys_order" ~ '^[A-Za-z0-9]{5,12}$'::"text")),
    CONSTRAINT "vb_storefront_checkouts_status_check" CHECK (("status" = ANY (ARRAY['awaiting_payment'::"text", 'sandbox_paid'::"text", 'paid'::"text", 'failed'::"text", 'expired'::"text", 'cancelled'::"text", 'reconciliation_required'::"text"])))
);


ALTER TABLE "public"."vb_storefront_checkouts" OWNER TO "postgres";


COMMENT ON TABLE "public"."vb_storefront_checkouts" IS 'Server-only checkout ledger. sandbox=true rows never become operational reservations.';



CREATE TABLE IF NOT EXISTS "public"."vb_storefront_payment_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "checkout_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'redsys'::"text" NOT NULL,
    "event_type" "text" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "signature_valid" boolean NOT NULL,
    "sandbox" boolean NOT NULL,
    "response_code" "text",
    "authorization_code" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."vb_storefront_payment_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vb_timeclock_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "punch_id" "uuid",
    "employee_id" "text" NOT NULL,
    "action" "text" NOT NULL,
    "previous_value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "next_value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "reason" "text" DEFAULT ''::"text" NOT NULL,
    "actor_email" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vb_timeclock_adjustments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vb_timeclock_employees" (
    "id" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "code_hash" "text" NOT NULL,
    "nif" "text" DEFAULT ''::"text" NOT NULL,
    "social_security_no" "text" DEFAULT ''::"text" NOT NULL,
    "work_center" "text" DEFAULT 'Voyager Balloons EU / Valverde del Majano'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vb_timeclock_employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vb_timeclock_punches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "punched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "offline_created_at" timestamp with time zone,
    "sync_id" "text",
    "source" "text" DEFAULT 'tablet'::"text" NOT NULL,
    "device_label" "text" DEFAULT ''::"text" NOT NULL,
    "ip_address" "text" DEFAULT ''::"text" NOT NULL,
    "user_agent" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vb_timeclock_punches_type_check" CHECK (("type" = ANY (ARRAY['clock_in'::"text", 'clock_out'::"text"])))
);


ALTER TABLE "public"."vb_timeclock_punches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vb_users" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "status" "text" NOT NULL,
    CONSTRAINT "vb_users_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'booking_manager'::"text", 'pilot'::"text", 'crew'::"text"]))),
    CONSTRAINT "vb_users_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."vb_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vb_whatsapp_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "phone" "text" NOT NULL,
    "display_name" "text" DEFAULT ''::"text" NOT NULL,
    "source" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "tags" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "last_seen_at" timestamp with time zone
);


ALTER TABLE "public"."vb_whatsapp_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vb_whatsapp_conversation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "from_status" "text",
    "to_status" "text",
    "actor_type" "text" DEFAULT 'system'::"text" NOT NULL,
    "actor_name" "text" DEFAULT ''::"text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."vb_whatsapp_conversation_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vb_whatsapp_conversation_reservations" (
    "conversation_id" "uuid" NOT NULL,
    "reservation_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "linked_by" "text" DEFAULT 'phone_match'::"text" NOT NULL,
    "confidence" numeric(4,3),
    "is_primary" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."vb_whatsapp_conversation_reservations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vb_whatsapp_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'needs_reply'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "requires_human" boolean DEFAULT true NOT NULL,
    "unread_count" integer DEFAULT 0 NOT NULL,
    "primary_reservation_id" "text",
    "last_message_at" timestamp with time zone,
    "last_inbound_at" timestamp with time zone,
    "last_outbound_at" timestamp with time zone,
    "last_human_reply_at" timestamp with time zone,
    "response_window_expires_at" timestamp with time zone,
    "snoozed_until" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "last_message_preview" "text" DEFAULT ''::"text" NOT NULL,
    "last_message_direction" "text" DEFAULT ''::"text" NOT NULL,
    "last_intent" "text" DEFAULT ''::"text" NOT NULL,
    "automation_rule_version" "text" DEFAULT ''::"text" NOT NULL,
    "last_inbound_preview" "text" DEFAULT ''::"text" NOT NULL,
    "last_outbound_preview" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "vb_whatsapp_conversations_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "vb_whatsapp_conversations_status_check" CHECK (("status" = ANY (ARRAY['needs_reply'::"text", 'waiting_customer'::"text", 'resolved'::"text", 'snoozed'::"text"]))),
    CONSTRAINT "vb_whatsapp_conversations_unread_count_check" CHECK (("unread_count" >= 0))
);


ALTER TABLE "public"."vb_whatsapp_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wanted_match_dispatches" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "wanted_request_id" "uuid" NOT NULL,
    "listing_ids" "uuid"[] NOT NULL,
    "match_fingerprint" "text" NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "provider_message_id" "text",
    "attempted_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "wanted_match_dispatches_listing_count" CHECK ((("cardinality"("listing_ids") >= 1) AND ("cardinality"("listing_ids") <= 5))),
    CONSTRAINT "wanted_match_dispatches_match_fingerprint_check" CHECK (("char_length"("match_fingerprint") = 64)),
    CONSTRAINT "wanted_match_dispatches_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'ACCEPTED'::"text", 'FAILED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."wanted_match_dispatches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wanted_requests" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "buyer_user_id" "uuid",
    "buyer_name" "text" NOT NULL,
    "buyer_email" "text" NOT NULL,
    "buyer_phone" "text",
    "category" "text" NOT NULL,
    "location_preference" "text",
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "budget_min_minor" bigint,
    "budget_max_minor" bigint,
    "details" "text" NOT NULL,
    "notify_on_match" boolean DEFAULT false NOT NULL,
    "privacy_consent_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "source" "text" DEFAULT 'wanted_form'::"text" NOT NULL,
    "submission_key" "text",
    "status" "text" DEFAULT 'NEW'::"text" NOT NULL,
    "last_activity_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "referrer_host" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "journey_key" "text",
    CONSTRAINT "wanted_requests_budget_max_minor_check" CHECK ((("budget_max_minor" IS NULL) OR ("budget_max_minor" >= 0))),
    CONSTRAINT "wanted_requests_budget_min_minor_check" CHECK ((("budget_min_minor" IS NULL) OR ("budget_min_minor" >= 0))),
    CONSTRAINT "wanted_requests_budget_order" CHECK ((("budget_min_minor" IS NULL) OR ("budget_max_minor" IS NULL) OR ("budget_min_minor" <= "budget_max_minor"))),
    CONSTRAINT "wanted_requests_buyer_email_check" CHECK ((("char_length"("buyer_email") >= 5) AND ("char_length"("buyer_email") <= 320))),
    CONSTRAINT "wanted_requests_buyer_name_check" CHECK ((("char_length"("buyer_name") >= 2) AND ("char_length"("buyer_name") <= 120))),
    CONSTRAINT "wanted_requests_buyer_phone_check" CHECK ((("buyer_phone" IS NULL) OR ("char_length"("buyer_phone") <= 60))),
    CONSTRAINT "wanted_requests_category_check" CHECK (("category" = ANY (ARRAY['complete'::"text", 'envelopes'::"text", 'baskets'::"text", 'burners'::"text", 'bottom-end'::"text", 'cylinders'::"text", 'other-equipment'::"text"]))),
    CONSTRAINT "wanted_requests_currency_check" CHECK (("currency" = ANY (ARRAY['EUR'::"text", 'GBP'::"text", 'USD'::"text"]))),
    CONSTRAINT "wanted_requests_details_check" CHECK ((("char_length"("details") >= 20) AND ("char_length"("details") <= 3000))),
    CONSTRAINT "wanted_requests_journey_key_length" CHECK ((("journey_key" IS NULL) OR ("char_length"("journey_key") = 64))),
    CONSTRAINT "wanted_requests_location_preference_check" CHECK ((("location_preference" IS NULL) OR ("char_length"("location_preference") <= 120))),
    CONSTRAINT "wanted_requests_referrer_host_length" CHECK ((("referrer_host" IS NULL) OR ("char_length"("referrer_host") <= 255))),
    CONSTRAINT "wanted_requests_source_check" CHECK (("source" = ANY (ARRAY['wanted_form'::"text", 'admin'::"text"]))),
    CONSTRAINT "wanted_requests_status_check" CHECK (("status" = ANY (ARRAY['NEW'::"text", 'REVIEWING'::"text", 'MATCHED'::"text", 'CONTACTED'::"text", 'CLOSED'::"text", 'SPAM'::"text"]))),
    CONSTRAINT "wanted_requests_submission_key_check" CHECK ((("submission_key" IS NULL) OR ("char_length"("submission_key") = 64))),
    CONSTRAINT "wanted_requests_utm_campaign_length" CHECK ((("utm_campaign" IS NULL) OR ("char_length"("utm_campaign") <= 120))),
    CONSTRAINT "wanted_requests_utm_medium_length" CHECK ((("utm_medium" IS NULL) OR ("char_length"("utm_medium") <= 120))),
    CONSTRAINT "wanted_requests_utm_source_length" CHECK ((("utm_source" IS NULL) OR ("char_length"("utm_source") <= 120)))
);


ALTER TABLE "public"."wanted_requests" OWNER TO "postgres";


COMMENT ON COLUMN "public"."wanted_requests"."journey_key" IS 'Daily server-HMAC journey key linking consented demand to acquisition without a raw visitor identifier.';



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_order_id_key" UNIQUE ("order_id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."catalog_search_events"
    ADD CONSTRAINT "catalog_search_events_event_key_key" UNIQUE ("event_key");



ALTER TABLE ONLY "public"."catalog_search_events"
    ADD CONSTRAINT "catalog_search_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commercial_notification_receipts"
    ADD CONSTRAINT "commercial_notification_receipts_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."commercial_notification_receipts"
    ADD CONSTRAINT "commercial_notification_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commercial_outcome_events"
    ADD CONSTRAINT "commercial_outcome_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commercial_outcomes"
    ADD CONSTRAINT "commercial_outcomes_entity_type_entity_id_key" UNIQUE ("entity_type", "entity_id");



ALTER TABLE ONLY "public"."commercial_outcomes"
    ADD CONSTRAINT "commercial_outcomes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."images"
    ADD CONSTRAINT "images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."indexing_submission_receipts"
    ADD CONSTRAINT "indexing_submission_receipts_batch_key_key" UNIQUE ("batch_key");



ALTER TABLE ONLY "public"."indexing_submission_receipts"
    ADD CONSTRAINT "indexing_submission_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listing_availability_confirmations"
    ADD CONSTRAINT "listing_availability_confirmations_listing_id_confirmed_on_key" UNIQUE ("listing_id", "confirmed_on");



ALTER TABLE ONLY "public"."listing_availability_confirmations"
    ADD CONSTRAINT "listing_availability_confirmations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listing_events"
    ADD CONSTRAINT "listing_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listing_lifecycle_events"
    ADD CONSTRAINT "listing_lifecycle_events_listing_id_key" UNIQUE ("listing_id");



ALTER TABLE ONLY "public"."listing_lifecycle_events"
    ADD CONSTRAINT "listing_lifecycle_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listing_quality_state"
    ADD CONSTRAINT "listing_quality_state_pkey" PRIMARY KEY ("listing_id");



ALTER TABLE ONLY "public"."listing_verification_events"
    ADD CONSTRAINT "listing_verification_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listing_verifications"
    ADD CONSTRAINT "listing_verifications_pkey" PRIMARY KEY ("listing_id");



ALTER TABLE ONLY "public"."listing_watch_dispatches"
    ADD CONSTRAINT "listing_watch_dispatches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listing_watch_dispatches"
    ADD CONSTRAINT "listing_watch_dispatches_watcher_id_snapshot_hash_key" UNIQUE ("watcher_id", "snapshot_hash");



ALTER TABLE ONLY "public"."listing_watchers"
    ADD CONSTRAINT "listing_watchers_id_listing_id_key" UNIQUE ("id", "listing_id");



ALTER TABLE ONLY "public"."listing_watchers"
    ADD CONSTRAINT "listing_watchers_listing_id_normalized_email_key" UNIQUE ("listing_id", "normalized_email");



ALTER TABLE ONLY "public"."listing_watchers"
    ADD CONSTRAINT "listing_watchers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketplace_inquiries"
    ADD CONSTRAINT "marketplace_inquiries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketplace_inquiry_offer_events"
    ADD CONSTRAINT "marketplace_inquiry_offer_events_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."marketplace_inquiry_offer_events"
    ADD CONSTRAINT "marketplace_inquiry_offer_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."new_balloon_quote_proposals"
    ADD CONSTRAINT "new_balloon_quote_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."new_balloon_quote_proposals"
    ADD CONSTRAINT "new_balloon_quote_proposals_proposal_fingerprint_key" UNIQUE ("proposal_fingerprint");



ALTER TABLE ONLY "public"."newsletter_recipients"
    ADD CONSTRAINT "newsletter_recipients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."newsletter_recipients"
    ADD CONSTRAINT "newsletter_recipients_run_id_email_key" UNIQUE ("run_id", "email");



ALTER TABLE ONLY "public"."newsletter_recovery_recipients"
    ADD CONSTRAINT "newsletter_recovery_recipients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."newsletter_recovery_recipients"
    ADD CONSTRAINT "newsletter_recovery_recipients_recovery_run_id_email_key" UNIQUE ("recovery_run_id", "email");



ALTER TABLE ONLY "public"."newsletter_recovery_runs"
    ADD CONSTRAINT "newsletter_recovery_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."newsletter_runs"
    ADD CONSTRAINT "newsletter_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_notification_receipts"
    ADD CONSTRAINT "payment_notification_receipts_pkey" PRIMARY KEY ("charge_id");



ALTER TABLE ONLY "public"."payment_notification_receipts"
    ADD CONSTRAINT "payment_notification_receipts_provider_message_id_key" UNIQUE ("provider_message_id");



ALTER TABLE ONLY "public"."payment_notification_receipts"
    ADD CONSTRAINT "payment_notification_receipts_stripe_event_id_key" UNIQUE ("stripe_event_id");



ALTER TABLE ONLY "public"."premium_alert_recipients"
    ADD CONSTRAINT "premium_alert_recipients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."premium_alert_recipients"
    ADD CONSTRAINT "premium_alert_recipients_run_id_email_key" UNIQUE ("run_id", "email");



ALTER TABLE ONLY "public"."premium_alert_runs"
    ADD CONSTRAINT "premium_alert_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."premium_checkout_intents"
    ADD CONSTRAINT "premium_checkout_intents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."premium_checkout_intents"
    ADD CONSTRAINT "premium_checkout_intents_stripe_session_id_key" UNIQUE ("stripe_session_id");



ALTER TABLE ONLY "public"."quote_requests"
    ADD CONSTRAINT "quote_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_assistance_requests"
    ADD CONSTRAINT "seller_assistance_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_funnel_events"
    ADD CONSTRAINT "seller_funnel_events_event_key_key" UNIQUE ("event_key");



ALTER TABLE ONLY "public"."seller_funnel_events"
    ADD CONSTRAINT "seller_funnel_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_webhook_events"
    ADD CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_automation_events"
    ADD CONSTRAINT "vb_automation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_automation_tasks"
    ADD CONSTRAINT "vb_automation_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_automation_tasks"
    ADD CONSTRAINT "vb_automation_tasks_stable_key_key" UNIQUE ("stable_key");



ALTER TABLE ONLY "public"."vb_channel_price_snapshots"
    ADD CONSTRAINT "vb_channel_price_snapshots_channel_departure_id_product_cod_key" UNIQUE ("channel", "departure_id", "product_code", "external_option_id", "pricing_category");



ALTER TABLE ONLY "public"."vb_channel_price_snapshots"
    ADD CONSTRAINT "vb_channel_price_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_compliance_items"
    ADD CONSTRAINT "vb_compliance_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_consent_tokens"
    ADD CONSTRAINT "vb_consent_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_consent_tokens"
    ADD CONSTRAINT "vb_consent_tokens_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."vb_departures"
    ADD CONSTRAINT "vb_departures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_flight_attendance"
    ADD CONSTRAINT "vb_flight_attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_flight_attendance"
    ADD CONSTRAINT "vb_flight_attendance_stable_key_key" UNIQUE ("stable_key");



ALTER TABLE ONLY "public"."vb_flight_signature_clearances"
    ADD CONSTRAINT "vb_flight_signature_clearances_pkey" PRIMARY KEY ("flight_date");



ALTER TABLE ONLY "public"."vb_gift_tickets"
    ADD CONSTRAINT "vb_gift_tickets_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."vb_gift_tickets"
    ADD CONSTRAINT "vb_gift_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_inventory_holds"
    ADD CONSTRAINT "vb_inventory_holds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_message_campaigns"
    ADD CONSTRAINT "vb_message_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_message_log"
    ADD CONSTRAINT "vb_message_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_meta"
    ADD CONSTRAINT "vb_meta_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."vb_price_quotes"
    ADD CONSTRAINT "vb_price_quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_pricing_events"
    ADD CONSTRAINT "vb_pricing_events_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."vb_pricing_events"
    ADD CONSTRAINT "vb_pricing_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_pricing_rules"
    ADD CONSTRAINT "vb_pricing_rules_destination_code_version_key" UNIQUE ("destination_code", "version");



ALTER TABLE ONLY "public"."vb_pricing_rules"
    ADD CONSTRAINT "vb_pricing_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_rate_plans"
    ADD CONSTRAINT "vb_rate_plans_destination_code_product_code_key" UNIQUE ("destination_code", "product_code");



ALTER TABLE ONLY "public"."vb_rate_plans"
    ADD CONSTRAINT "vb_rate_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_reservations"
    ADD CONSTRAINT "vb_reservations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_storefront_checkouts"
    ADD CONSTRAINT "vb_storefront_checkouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_storefront_checkouts"
    ADD CONSTRAINT "vb_storefront_checkouts_redsys_order_key" UNIQUE ("redsys_order");



ALTER TABLE ONLY "public"."vb_storefront_payment_events"
    ADD CONSTRAINT "vb_storefront_payment_events_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."vb_storefront_payment_events"
    ADD CONSTRAINT "vb_storefront_payment_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_timeclock_adjustments"
    ADD CONSTRAINT "vb_timeclock_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_timeclock_employees"
    ADD CONSTRAINT "vb_timeclock_employees_code_hash_key" UNIQUE ("code_hash");



ALTER TABLE ONLY "public"."vb_timeclock_employees"
    ADD CONSTRAINT "vb_timeclock_employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_timeclock_punches"
    ADD CONSTRAINT "vb_timeclock_punches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_timeclock_punches"
    ADD CONSTRAINT "vb_timeclock_punches_sync_id_key" UNIQUE ("sync_id");



ALTER TABLE ONLY "public"."vb_users"
    ADD CONSTRAINT "vb_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."vb_users"
    ADD CONSTRAINT "vb_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_whatsapp_contacts"
    ADD CONSTRAINT "vb_whatsapp_contacts_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "public"."vb_whatsapp_contacts"
    ADD CONSTRAINT "vb_whatsapp_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_whatsapp_conversation_events"
    ADD CONSTRAINT "vb_whatsapp_conversation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vb_whatsapp_conversation_reservations"
    ADD CONSTRAINT "vb_whatsapp_conversation_reservations_pkey" PRIMARY KEY ("conversation_id", "reservation_id");



ALTER TABLE ONLY "public"."vb_whatsapp_conversations"
    ADD CONSTRAINT "vb_whatsapp_conversations_contact_id_key" UNIQUE ("contact_id");



ALTER TABLE ONLY "public"."vb_whatsapp_conversations"
    ADD CONSTRAINT "vb_whatsapp_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wanted_match_dispatches"
    ADD CONSTRAINT "wanted_match_dispatches_match_fingerprint_key" UNIQUE ("match_fingerprint");



ALTER TABLE ONLY "public"."wanted_match_dispatches"
    ADD CONSTRAINT "wanted_match_dispatches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wanted_requests"
    ADD CONSTRAINT "wanted_requests_pkey" PRIMARY KEY ("id");



CREATE INDEX "catalog_search_events_journey_idx" ON "public"."catalog_search_events" USING "btree" ("journey_key", "created_at") WHERE ("journey_key" IS NOT NULL);



CREATE INDEX "catalog_search_source_idx" ON "public"."catalog_search_events" USING "btree" ("utm_source", "created_at" DESC);



CREATE INDEX "catalog_search_zero_demand_idx" ON "public"."catalog_search_events" USING "btree" ("zero_results", "category", "created_at" DESC);



CREATE INDEX "commercial_notification_receipts_attention_idx" ON "public"."commercial_notification_receipts" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "commercial_notification_receipts_entity_idx" ON "public"."commercial_notification_receipts" USING "btree" ("entity_type", "entity_id", "created_at" DESC);



CREATE INDEX "commercial_notification_receipts_retry_idx" ON "public"."commercial_notification_receipts" USING "btree" ("next_attempt_at", "notification_type") WHERE (("status" = ANY (ARRAY['pending'::"text", 'failed'::"text"])) AND ("delivery_attempts" < 2));



CREATE INDEX "commercial_outcome_events_outcome_created_idx" ON "public"."commercial_outcome_events" USING "btree" ("outcome_id", "created_at" DESC);



CREATE INDEX "commercial_outcomes_evidence_closed_idx" ON "public"."commercial_outcomes" USING "btree" ("evidence_level", "closed_at" DESC);



CREATE INDEX "indexing_submission_status_idx" ON "public"."indexing_submission_receipts" USING "btree" ("status", "attempted_at" DESC);



CREATE INDEX "listing_availability_confirmations_latest_idx" ON "public"."listing_availability_confirmations" USING "btree" ("listing_id", "confirmed_at" DESC);



CREATE INDEX "listing_events_attribution_idx" ON "public"."listing_events" USING "btree" ("utm_source", "event_type", "created_at" DESC);



CREATE UNIQUE INDEX "listing_events_event_key_unique" ON "public"."listing_events" USING "btree" ("event_key") WHERE ("event_key" IS NOT NULL);



CREATE INDEX "listing_events_journey_idx" ON "public"."listing_events" USING "btree" ("journey_key", "event_type", "created_at") WHERE ("journey_key" IS NOT NULL);



CREATE INDEX "listing_lifecycle_events_created_idx" ON "public"."listing_lifecycle_events" USING "btree" ("created_at" DESC);



CREATE INDEX "listing_quality_state_attention_idx" ON "public"."listing_quality_state" USING "btree" ("status", "last_checked_at");



CREATE INDEX "listing_verification_events_listing_idx" ON "public"."listing_verification_events" USING "btree" ("listing_id", "created_at" DESC);



CREATE INDEX "listing_verifications_review_queue_idx" ON "public"."listing_verifications" USING "btree" ("status", "requested_at") WHERE ("status" = 'IN_REVIEW'::"text");



CREATE INDEX "listing_watch_dispatches_status_idx" ON "public"."listing_watch_dispatches" USING "btree" ("status", "updated_at");



CREATE INDEX "listing_watchers_listing_status_idx" ON "public"."listing_watchers" USING "btree" ("listing_id", "status", "updated_at" DESC);



CREATE INDEX "listing_watchers_submission_rate_idx" ON "public"."listing_watchers" USING "btree" ("submission_key", "created_at" DESC) WHERE ("submission_key" IS NOT NULL);



CREATE INDEX "marketplace_inquiries_buyer_email_idx" ON "public"."marketplace_inquiries" USING "btree" ("lower"("buyer_email"), "created_at" DESC);



CREATE INDEX "marketplace_inquiries_journey_idx" ON "public"."marketplace_inquiries" USING "btree" ("journey_key", "created_at") WHERE ("journey_key" IS NOT NULL);



CREATE INDEX "marketplace_inquiries_listing_created_idx" ON "public"."marketplace_inquiries" USING "btree" ("listing_id", "created_at" DESC);



CREATE INDEX "marketplace_inquiries_status_activity_idx" ON "public"."marketplace_inquiries" USING "btree" ("status", "last_activity_at" DESC);



CREATE INDEX "marketplace_inquiry_offer_events_attention_idx" ON "public"."marketplace_inquiry_offer_events" USING "btree" ("buyer_notification_status", "created_at" DESC) WHERE ("buyer_notification_status" = ANY (ARRAY['pending'::"text", 'failed'::"text"]));



CREATE INDEX "marketplace_inquiry_offer_events_inquiry_created_idx" ON "public"."marketplace_inquiry_offer_events" USING "btree" ("inquiry_id", "created_at" DESC);



CREATE INDEX "marketplace_inquiry_offer_seller_attention_idx" ON "public"."marketplace_inquiry_offer_events" USING "btree" ("seller_notification_status", "created_at" DESC) WHERE ("seller_notification_status" = ANY (ARRAY['pending'::"text", 'failed'::"text"]));



CREATE UNIQUE INDEX "marketplace_inquiry_one_buyer_response_per_seller_event" ON "public"."marketplace_inquiry_offer_events" USING "btree" ("responding_to_event_id") WHERE ("responding_to_event_id" IS NOT NULL);



CREATE INDEX "new_balloon_quote_proposals_request_created_idx" ON "public"."new_balloon_quote_proposals" USING "btree" ("quote_request_id", "created_at" DESC);



CREATE INDEX "newsletter_recipients_run_id_idx" ON "public"."newsletter_recipients" USING "btree" ("run_id");



CREATE INDEX "newsletter_recipients_status_idx" ON "public"."newsletter_recipients" USING "btree" ("status");



CREATE UNIQUE INDEX "newsletter_recovery_one_live_attempt" ON "public"."newsletter_recovery_runs" USING "btree" ("original_run_id") WHERE (("dry_run" = false) AND ("status" = ANY (ARRAY['running'::"text", 'sent'::"text", 'partial'::"text", 'failed'::"text", 'audit_uncertain'::"text"])));



CREATE INDEX "newsletter_recovery_recipients_run_idx" ON "public"."newsletter_recovery_recipients" USING "btree" ("recovery_run_id", "status");



CREATE INDEX "newsletter_recovery_runs_original_idx" ON "public"."newsletter_recovery_runs" USING "btree" ("original_run_id", "created_at" DESC);



CREATE INDEX "newsletter_runs_created_at_idx" ON "public"."newsletter_runs" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "newsletter_runs_one_live_send_per_period" ON "public"."newsletter_runs" USING "btree" ("period_key") WHERE (("dry_run" = false) AND ("test_email" IS NULL) AND ("status" = ANY (ARRAY['running'::"text", 'sent'::"text", 'partial'::"text", 'audit_uncertain'::"text"])));



CREATE INDEX "newsletter_runs_status_idx" ON "public"."newsletter_runs" USING "btree" ("status");



CREATE INDEX "payment_notification_receipts_accepted_at_idx" ON "public"."payment_notification_receipts" USING "btree" ("accepted_at" DESC);



CREATE INDEX "premium_alert_recipients_run_id_idx" ON "public"."premium_alert_recipients" USING "btree" ("run_id");



CREATE INDEX "premium_alert_recipients_status_idx" ON "public"."premium_alert_recipients" USING "btree" ("status");



CREATE INDEX "premium_alert_runs_created_at_idx" ON "public"."premium_alert_runs" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "premium_alert_runs_one_success_per_listing" ON "public"."premium_alert_runs" USING "btree" ("listing_id") WHERE ("status" = ANY (ARRAY['running'::"text", 'sent'::"text", 'partial'::"text"]));



CREATE INDEX "premium_alert_runs_status_idx" ON "public"."premium_alert_runs" USING "btree" ("status");



CREATE INDEX "premium_checkout_intents_user_created_idx" ON "public"."premium_checkout_intents" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "quote_requests_journey_idx" ON "public"."quote_requests" USING "btree" ("journey_key", "created_at") WHERE ("journey_key" IS NOT NULL);



CREATE INDEX "quote_requests_recent_duplicate_idx" ON "public"."quote_requests" USING "btree" ("lower"("email"), "equipment_type", "created_at" DESC);



CREATE INDEX "quote_requests_source_context_created_at_idx" ON "public"."quote_requests" USING "btree" ("source_context", "created_at" DESC);



CREATE INDEX "quote_requests_submission_rate_idx" ON "public"."quote_requests" USING "btree" ("submission_key", "created_at" DESC) WHERE ("submission_key" IS NOT NULL);



CREATE INDEX "seller_assistance_email_created_idx" ON "public"."seller_assistance_requests" USING "btree" ("lower"("email"), "category", "created_at" DESC);



CREATE INDEX "seller_assistance_journey_idx" ON "public"."seller_assistance_requests" USING "btree" ("journey_key", "created_at") WHERE ("journey_key" IS NOT NULL);



CREATE INDEX "seller_assistance_status_activity_idx" ON "public"."seller_assistance_requests" USING "btree" ("status", "last_activity_at");



CREATE INDEX "seller_assistance_submission_rate_idx" ON "public"."seller_assistance_requests" USING "btree" ("submission_key", "created_at" DESC) WHERE ("submission_key" IS NOT NULL);



CREATE INDEX "seller_funnel_entry_context_created_idx" ON "public"."seller_funnel_events" USING "btree" ("entry_context", "created_at" DESC);



CREATE INDEX "seller_funnel_listing_created_idx" ON "public"."seller_funnel_events" USING "btree" ("listing_id", "created_at" DESC) WHERE ("listing_id" IS NOT NULL);



CREATE INDEX "seller_funnel_seller_created_idx" ON "public"."seller_funnel_events" USING "btree" ("seller_id", "created_at" DESC);



CREATE INDEX "seller_funnel_stage_created_idx" ON "public"."seller_funnel_events" USING "btree" ("stage", "created_at" DESC);



CREATE INDEX "stripe_webhook_events_status_idx" ON "public"."stripe_webhook_events" USING "btree" ("status", "updated_at" DESC);



CREATE INDEX "vb_automation_events_created_idx" ON "public"."vb_automation_events" USING "btree" ("created_at" DESC);



CREATE INDEX "vb_automation_events_reservation_idx" ON "public"."vb_automation_events" USING "btree" ("reservation_id", "created_at" DESC);



CREATE INDEX "vb_automation_tasks_reservation_idx" ON "public"."vb_automation_tasks" USING "btree" ("reservation_id", "status");



CREATE INDEX "vb_automation_tasks_status_idx" ON "public"."vb_automation_tasks" USING "btree" ("status", "priority", "due_at");



CREATE INDEX "vb_channel_price_snapshots_idempotency_idx" ON "public"."vb_channel_price_snapshots" USING "btree" ("idempotency_key");



CREATE INDEX "vb_channel_price_snapshots_lookup_idx" ON "public"."vb_channel_price_snapshots" USING "btree" ("channel", "departure_id", "external_product_id", "external_option_id", "status");



CREATE INDEX "vb_compliance_group_idx" ON "public"."vb_compliance_items" USING "btree" ("group_type", "expires_at");



CREATE INDEX "vb_consent_tokens_expiry_idx" ON "public"."vb_consent_tokens" USING "btree" ("status", "expires_at");



CREATE INDEX "vb_consent_tokens_reservation_idx" ON "public"."vb_consent_tokens" USING "btree" ("reservation_id", "passenger_order", "status");



CREATE INDEX "vb_departures_date_status_idx" ON "public"."vb_departures" USING "btree" ("flight_date", "availability_status", "destination_code");



CREATE UNIQUE INDEX "vb_departures_environment_key" ON "public"."vb_departures" USING "btree" ("destination_code", "flight_date", "flight_time", "sandbox");



CREATE INDEX "vb_flight_attendance_date_idx" ON "public"."vb_flight_attendance" USING "btree" ("flight_date", "status", "created_at");



CREATE INDEX "vb_gift_tickets_status_idx" ON "public"."vb_gift_tickets" USING "btree" ("status", "expires_at");



CREATE INDEX "vb_inventory_holds_active_idx" ON "public"."vb_inventory_holds" USING "btree" ("departure_id", "expires_at") WHERE ("status" = 'active'::"text");



CREATE INDEX "vb_message_campaigns_created_idx" ON "public"."vb_message_campaigns" USING "btree" ("created_at" DESC);



CREATE INDEX "vb_message_campaigns_target_date_idx" ON "public"."vb_message_campaigns" USING "btree" ("target_date");



CREATE INDEX "vb_message_log_campaign_idx" ON "public"."vb_message_log" USING "btree" ("campaign_id");



CREATE INDEX "vb_message_log_conversation_idx" ON "public"."vb_message_log" USING "btree" ("conversation_id", "created_at" DESC);



CREATE UNIQUE INDEX "vb_message_log_idempotency_key_unique" ON "public"."vb_message_log" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "vb_message_log_provider_message_idx" ON "public"."vb_message_log" USING "btree" ("provider_message_id");



CREATE INDEX "vb_message_log_reservation_idx" ON "public"."vb_message_log" USING "btree" ("reservation_id", "created_at" DESC);



CREATE INDEX "vb_message_log_status_idx" ON "public"."vb_message_log" USING "btree" ("status", "channel", "created_at" DESC);



CREATE INDEX "vb_message_log_whatsapp_inbound_idx" ON "public"."vb_message_log" USING "btree" ("created_at" DESC) WHERE (("channel" = 'whatsapp'::"text") AND ("direction" = 'inbound'::"text"));



CREATE INDEX "vb_price_quotes_departure_expiry_idx" ON "public"."vb_price_quotes" USING "btree" ("departure_id", "expires_at", "status");



CREATE INDEX "vb_pricing_events_departure_created_idx" ON "public"."vb_pricing_events" USING "btree" ("departure_id", "created_at" DESC);



CREATE INDEX "vb_reservations_flight_date_idx" ON "public"."vb_reservations" USING "btree" ("flight_date");



CREATE INDEX "vb_reservations_needs_review_idx" ON "public"."vb_reservations" USING "btree" ("needs_review") WHERE ("needs_review" = true);



CREATE INDEX "vb_reservations_pending_without_date_idx" ON "public"."vb_reservations" USING "btree" ("updated_at") WHERE (("status" = 'pending'::"text") AND ("flight_date" IS NULL));



CREATE INDEX "vb_reservations_price_quote_idx" ON "public"."vb_reservations" USING "btree" ("price_quote_id") WHERE ("price_quote_id" IS NOT NULL);



CREATE INDEX "vb_reservations_source_external_idx" ON "public"."vb_reservations" USING "btree" ("source_channel", "external_ref");



CREATE INDEX "vb_reservations_utm_campaign_idx" ON "public"."vb_reservations" USING "btree" ((("attribution" ->> 'utm_campaign'::"text"))) WHERE (NULLIF(("attribution" ->> 'utm_campaign'::"text"), ''::"text") IS NOT NULL);



CREATE INDEX "vb_storefront_checkouts_status_idx" ON "public"."vb_storefront_checkouts" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "vb_storefront_checkouts_utm_campaign_idx" ON "public"."vb_storefront_checkouts" USING "btree" (((("metadata" -> 'attribution'::"text") ->> 'utm_campaign'::"text"))) WHERE (NULLIF((("metadata" -> 'attribution'::"text") ->> 'utm_campaign'::"text"), ''::"text") IS NOT NULL);



CREATE INDEX "vb_timeclock_employees_active_idx" ON "public"."vb_timeclock_employees" USING "btree" ("active") WHERE ("active" = true);



CREATE INDEX "vb_timeclock_punches_employee_time_idx" ON "public"."vb_timeclock_punches" USING "btree" ("employee_id", "punched_at" DESC);



CREATE INDEX "vb_timeclock_punches_time_idx" ON "public"."vb_timeclock_punches" USING "btree" ("punched_at" DESC);



CREATE INDEX "vb_whatsapp_contacts_name_idx" ON "public"."vb_whatsapp_contacts" USING "btree" ("display_name");



CREATE INDEX "vb_whatsapp_conversation_events_conversation_idx" ON "public"."vb_whatsapp_conversation_events" USING "btree" ("conversation_id", "created_at" DESC);



CREATE INDEX "vb_whatsapp_conversation_reservations_reservation_idx" ON "public"."vb_whatsapp_conversation_reservations" USING "btree" ("reservation_id", "conversation_id");



CREATE INDEX "vb_whatsapp_conversations_queue_idx" ON "public"."vb_whatsapp_conversations" USING "btree" ("status", "priority", "last_message_at" DESC);



CREATE INDEX "vb_whatsapp_conversations_reservation_idx" ON "public"."vb_whatsapp_conversations" USING "btree" ("primary_reservation_id", "last_message_at" DESC);



CREATE INDEX "wanted_match_dispatches_request_status_idx" ON "public"."wanted_match_dispatches" USING "btree" ("wanted_request_id", "status", "updated_at" DESC);



CREATE INDEX "wanted_requests_attribution_idx" ON "public"."wanted_requests" USING "btree" ("utm_source", "status", "created_at" DESC);



CREATE INDEX "wanted_requests_buyer_dedup_idx" ON "public"."wanted_requests" USING "btree" ("lower"("buyer_email"), "category", "created_at" DESC);



CREATE INDEX "wanted_requests_journey_idx" ON "public"."wanted_requests" USING "btree" ("journey_key", "created_at") WHERE ("journey_key" IS NOT NULL);



CREATE INDEX "wanted_requests_match_idx" ON "public"."wanted_requests" USING "btree" ("category", "currency", "budget_max_minor", "created_at" DESC) WHERE ("status" <> ALL (ARRAY['CLOSED'::"text", 'SPAM'::"text"]));



CREATE INDEX "wanted_requests_status_created_idx" ON "public"."wanted_requests" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "wanted_requests_submission_rate_idx" ON "public"."wanted_requests" USING "btree" ("submission_key", "created_at" DESC) WHERE ("submission_key" IS NOT NULL);



CREATE OR REPLACE TRIGGER "enforce_marketplace_inquiry_outcome_status" BEFORE UPDATE OF "status" ON "public"."marketplace_inquiries" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_commercial_outcome_status"();



CREATE OR REPLACE TRIGGER "enforce_quote_request_outcome_status" BEFORE UPDATE OF "status" ON "public"."quote_requests" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_commercial_outcome_status"();



CREATE OR REPLACE TRIGGER "record_initial_marketplace_offer" AFTER INSERT ON "public"."marketplace_inquiries" FOR EACH ROW EXECUTE FUNCTION "public"."record_initial_marketplace_offer"();



CREATE OR REPLACE TRIGGER "set_commercial_notification_receipts_updated_at" BEFORE UPDATE ON "public"."commercial_notification_receipts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_commercial_outcomes_updated_at" BEFORE UPDATE ON "public"."commercial_outcomes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_indexing_submission_receipts_updated_at" BEFORE UPDATE ON "public"."indexing_submission_receipts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_listing_quality_state_updated_at" BEFORE UPDATE ON "public"."listing_quality_state" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_listing_verifications_updated_at" BEFORE UPDATE ON "public"."listing_verifications" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_listing_watch_dispatches_updated_at" BEFORE UPDATE ON "public"."listing_watch_dispatches" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_listing_watchers_updated_at" BEFORE UPDATE ON "public"."listing_watchers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_marketplace_inquiries_updated_at" BEFORE UPDATE ON "public"."marketplace_inquiries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_new_balloon_quote_proposals_updated_at" BEFORE UPDATE ON "public"."new_balloon_quote_proposals" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_newsletter_recipients_updated_at" BEFORE UPDATE ON "public"."newsletter_recipients" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_newsletter_runs_updated_at" BEFORE UPDATE ON "public"."newsletter_runs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_premium_alert_recipients_updated_at" BEFORE UPDATE ON "public"."premium_alert_recipients" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_premium_alert_runs_updated_at" BEFORE UPDATE ON "public"."premium_alert_runs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_seller_assistance_updated_at" BEFORE UPDATE ON "public"."seller_assistance_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_stripe_webhook_events_updated_at" BEFORE UPDATE ON "public"."stripe_webhook_events" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_wanted_match_dispatches_updated_at" BEFORE UPDATE ON "public"."wanted_match_dispatches" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_wanted_requests_updated_at" BEFORE UPDATE ON "public"."wanted_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "vb_storefront_copy_checkout_attribution_trigger" AFTER UPDATE OF "status", "reservation_id", "metadata" ON "public"."vb_storefront_checkouts" FOR EACH ROW WHEN ((("new"."status" = 'paid'::"text") AND ("new"."reservation_id" IS NOT NULL))) EXECUTE FUNCTION "public"."vb_storefront_copy_checkout_attribution"();



ALTER TABLE ONLY "public"."commercial_outcome_events"
    ADD CONSTRAINT "commercial_outcome_events_outcome_id_fkey" FOREIGN KEY ("outcome_id") REFERENCES "public"."commercial_outcomes"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."commercial_outcome_events"
    ADD CONSTRAINT "commercial_outcome_events_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."commercial_outcomes"
    ADD CONSTRAINT "commercial_outcomes_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."images"
    ADD CONSTRAINT "images_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_availability_confirmations"
    ADD CONSTRAINT "listing_availability_confirmations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_availability_confirmations"
    ADD CONSTRAINT "listing_availability_confirmations_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."listing_events"
    ADD CONSTRAINT "listing_events_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_events"
    ADD CONSTRAINT "listing_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."listing_lifecycle_events"
    ADD CONSTRAINT "listing_lifecycle_events_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."listing_lifecycle_events"
    ADD CONSTRAINT "listing_lifecycle_events_marketplace_inquiry_id_fkey" FOREIGN KEY ("marketplace_inquiry_id") REFERENCES "public"."marketplace_inquiries"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."listing_lifecycle_events"
    ADD CONSTRAINT "listing_lifecycle_events_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."listing_lifecycle_events"
    ADD CONSTRAINT "listing_lifecycle_events_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."listing_quality_state"
    ADD CONSTRAINT "listing_quality_state_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_verification_events"
    ADD CONSTRAINT "listing_verification_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."listing_verification_events"
    ADD CONSTRAINT "listing_verification_events_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_verifications"
    ADD CONSTRAINT "listing_verifications_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_verifications"
    ADD CONSTRAINT "listing_verifications_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."listing_verifications"
    ADD CONSTRAINT "listing_verifications_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."listing_watch_dispatches"
    ADD CONSTRAINT "listing_watch_dispatches_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_watch_dispatches"
    ADD CONSTRAINT "listing_watch_dispatches_watcher_id_fkey" FOREIGN KEY ("watcher_id") REFERENCES "public"."listing_watchers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_watch_dispatches"
    ADD CONSTRAINT "listing_watch_dispatches_watcher_listing_fk" FOREIGN KEY ("watcher_id", "listing_id") REFERENCES "public"."listing_watchers"("id", "listing_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_watchers"
    ADD CONSTRAINT "listing_watchers_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."listing_watchers"
    ADD CONSTRAINT "listing_watchers_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_inquiries"
    ADD CONSTRAINT "marketplace_inquiries_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."marketplace_inquiries"
    ADD CONSTRAINT "marketplace_inquiries_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."marketplace_inquiry_offer_events"
    ADD CONSTRAINT "marketplace_inquiry_offer_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."marketplace_inquiry_offer_events"
    ADD CONSTRAINT "marketplace_inquiry_offer_events_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "public"."marketplace_inquiries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_inquiry_offer_events"
    ADD CONSTRAINT "marketplace_inquiry_offer_events_responding_to_event_id_fkey" FOREIGN KEY ("responding_to_event_id") REFERENCES "public"."marketplace_inquiry_offer_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."new_balloon_quote_proposals"
    ADD CONSTRAINT "new_balloon_quote_proposals_quote_request_id_fkey" FOREIGN KEY ("quote_request_id") REFERENCES "public"."quote_requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."new_balloon_quote_proposals"
    ADD CONSTRAINT "new_balloon_quote_proposals_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."newsletter_recipients"
    ADD CONSTRAINT "newsletter_recipients_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."newsletter_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."newsletter_recovery_recipients"
    ADD CONSTRAINT "newsletter_recovery_recipients_recovery_run_id_fkey" FOREIGN KEY ("recovery_run_id") REFERENCES "public"."newsletter_recovery_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."newsletter_recovery_runs"
    ADD CONSTRAINT "newsletter_recovery_runs_original_run_id_fkey" FOREIGN KEY ("original_run_id") REFERENCES "public"."newsletter_runs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payment_notification_receipts"
    ADD CONSTRAINT "payment_notification_receipts_stripe_event_id_fkey" FOREIGN KEY ("stripe_event_id") REFERENCES "public"."stripe_webhook_events"("event_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."premium_alert_recipients"
    ADD CONSTRAINT "premium_alert_recipients_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."premium_alert_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."premium_alert_runs"
    ADD CONSTRAINT "premium_alert_runs_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."premium_checkout_intents"
    ADD CONSTRAINT "premium_checkout_intents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_assistance_requests"
    ADD CONSTRAINT "seller_assistance_requests_linked_listing_id_fkey" FOREIGN KEY ("linked_listing_id") REFERENCES "public"."listings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."seller_assistance_requests"
    ADD CONSTRAINT "seller_assistance_requests_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."seller_funnel_events"
    ADD CONSTRAINT "seller_funnel_events_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_funnel_events"
    ADD CONSTRAINT "seller_funnel_events_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_premium_granted_by_fkey" FOREIGN KEY ("premium_granted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vb_channel_price_snapshots"
    ADD CONSTRAINT "vb_channel_price_snapshots_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "public"."vb_departures"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vb_channel_price_snapshots"
    ADD CONSTRAINT "vb_channel_price_snapshots_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."vb_price_quotes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vb_inventory_holds"
    ADD CONSTRAINT "vb_inventory_holds_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "public"."vb_departures"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vb_inventory_holds"
    ADD CONSTRAINT "vb_inventory_holds_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."vb_price_quotes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vb_message_log"
    ADD CONSTRAINT "vb_message_log_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."vb_message_campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vb_message_log"
    ADD CONSTRAINT "vb_message_log_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."vb_whatsapp_conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vb_price_quotes"
    ADD CONSTRAINT "vb_price_quotes_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "public"."vb_departures"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vb_pricing_events"
    ADD CONSTRAINT "vb_pricing_events_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "public"."vb_departures"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vb_pricing_events"
    ADD CONSTRAINT "vb_pricing_events_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."vb_price_quotes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vb_reservations"
    ADD CONSTRAINT "vb_reservations_price_quote_id_fkey" FOREIGN KEY ("price_quote_id") REFERENCES "public"."vb_price_quotes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vb_storefront_checkouts"
    ADD CONSTRAINT "vb_storefront_checkouts_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "public"."vb_departures"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."vb_storefront_checkouts"
    ADD CONSTRAINT "vb_storefront_checkouts_hold_id_fkey" FOREIGN KEY ("hold_id") REFERENCES "public"."vb_inventory_holds"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vb_storefront_checkouts"
    ADD CONSTRAINT "vb_storefront_checkouts_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."vb_price_quotes"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."vb_storefront_payment_events"
    ADD CONSTRAINT "vb_storefront_payment_events_checkout_id_fkey" FOREIGN KEY ("checkout_id") REFERENCES "public"."vb_storefront_checkouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vb_timeclock_adjustments"
    ADD CONSTRAINT "vb_timeclock_adjustments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."vb_timeclock_employees"("id");



ALTER TABLE ONLY "public"."vb_timeclock_adjustments"
    ADD CONSTRAINT "vb_timeclock_adjustments_punch_id_fkey" FOREIGN KEY ("punch_id") REFERENCES "public"."vb_timeclock_punches"("id");



ALTER TABLE ONLY "public"."vb_timeclock_punches"
    ADD CONSTRAINT "vb_timeclock_punches_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."vb_timeclock_employees"("id");



ALTER TABLE ONLY "public"."vb_whatsapp_conversation_events"
    ADD CONSTRAINT "vb_whatsapp_conversation_events_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."vb_whatsapp_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vb_whatsapp_conversation_reservations"
    ADD CONSTRAINT "vb_whatsapp_conversation_reservations_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."vb_whatsapp_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vb_whatsapp_conversations"
    ADD CONSTRAINT "vb_whatsapp_conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."vb_whatsapp_contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wanted_match_dispatches"
    ADD CONSTRAINT "wanted_match_dispatches_wanted_request_id_fkey" FOREIGN KEY ("wanted_request_id") REFERENCES "public"."wanted_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wanted_requests"
    ADD CONSTRAINT "wanted_requests_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



CREATE POLICY "Admins can do everything on newsletter_recipients" ON "public"."newsletter_recipients" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can do everything on newsletter_runs" ON "public"."newsletter_runs" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can do everything on premium_alert_recipients" ON "public"."premium_alert_recipients" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can do everything on premium_alert_runs" ON "public"."premium_alert_runs" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can do everything on quote_requests" ON "public"."quote_requests" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage commercial notification receipts" ON "public"."commercial_notification_receipts" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage commercial outcomes" ON "public"."commercial_outcomes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage listing quality state" ON "public"."listing_quality_state" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage listing verification" ON "public"."listing_verifications" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage listing verification events" ON "public"."listing_verification_events" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage listing watch dispatches" ON "public"."listing_watch_dispatches" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage listing watchers" ON "public"."listing_watchers" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage marketplace enquiries" ON "public"."marketplace_inquiries" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage marketplace negotiation events" ON "public"."marketplace_inquiry_offer_events" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage new balloon proposals" ON "public"."new_balloon_quote_proposals" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage seller assistance" ON "public"."seller_assistance_requests" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage wanted match dispatches" ON "public"."wanted_match_dispatches" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage wanted requests" ON "public"."wanted_requests" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read availability confirmations" ON "public"."listing_availability_confirmations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read catalog search demand" ON "public"."catalog_search_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read commercial outcome history" ON "public"."commercial_outcome_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read indexing submission receipts" ON "public"."indexing_submission_receipts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read listing lifecycle" ON "public"."listing_lifecycle_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read seller funnel" ON "public"."seller_funnel_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Allow anonymous inserts" ON "public"."bookings" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can view active listings" ON "public"."listings" FOR SELECT USING (("status" = ANY (ARRAY['ACTIVE_PUBLIC'::"text", 'ACTIVE_PREMIUM'::"text"])));



CREATE POLICY "Images inherit listing viewing rights (Premium)" ON "public"."images" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "images"."listing_id") AND ("listings"."status" = 'ACTIVE_PREMIUM'::"text")))) AND (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_premium" = true))))));



CREATE POLICY "Images inherit listing viewing rights (Public)" ON "public"."images" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "images"."listing_id") AND ("listings"."status" = 'ACTIVE_PUBLIC'::"text")))));



CREATE POLICY "Sellers can delete own listings" ON "public"."listings" FOR DELETE USING (("auth"."uid"() = "seller_id"));



CREATE POLICY "Sellers can insert own listings" ON "public"."listings" FOR INSERT WITH CHECK (("auth"."uid"() = "seller_id"));



CREATE POLICY "Sellers can manage images of their listings" ON "public"."images" USING ((EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "images"."listing_id") AND ("listings"."seller_id" = "auth"."uid"())))));



CREATE POLICY "Sellers can read own availability confirmations" ON "public"."listing_availability_confirmations" FOR SELECT TO "authenticated" USING (("seller_id" = "auth"."uid"()));



CREATE POLICY "Sellers can read own listing lifecycle" ON "public"."listing_lifecycle_events" FOR SELECT TO "authenticated" USING (("seller_id" = "auth"."uid"()));



CREATE POLICY "Sellers can update enquiries for their listings" ON "public"."marketplace_inquiries" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "marketplace_inquiries"."listing_id") AND ("listings"."seller_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "marketplace_inquiries"."listing_id") AND ("listings"."seller_id" = "auth"."uid"())))));



CREATE POLICY "Sellers can update own listings" ON "public"."listings" FOR UPDATE USING (("auth"."uid"() = "seller_id"));



CREATE POLICY "Sellers can view enquiries for their listings" ON "public"."marketplace_inquiries" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "marketplace_inquiries"."listing_id") AND ("listings"."seller_id" = "auth"."uid"())))));



CREATE POLICY "Sellers can view negotiation events for their listings" ON "public"."marketplace_inquiry_offer_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."marketplace_inquiries" "inquiry"
     JOIN "public"."listings" "listing" ON (("listing"."id" = "inquiry"."listing_id")))
  WHERE (("inquiry"."id" = "marketplace_inquiry_offer_events"."inquiry_id") AND ("listing"."seller_id" = "auth"."uid"())))));



CREATE POLICY "Sellers can view own listings" ON "public"."listings" FOR SELECT USING (("auth"."uid"() = "seller_id"));



CREATE POLICY "Sellers can view quality state for their listings" ON "public"."listing_quality_state" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "listing_quality_state"."listing_id") AND ("listings"."seller_id" = "auth"."uid"())))));



CREATE POLICY "Sellers can view verification events for their listings" ON "public"."listing_verification_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "listing_verification_events"."listing_id") AND ("listings"."seller_id" = "auth"."uid"())))));



CREATE POLICY "Sellers can view verification for their listings" ON "public"."listing_verifications" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "listing_verifications"."listing_id") AND ("listings"."seller_id" = "auth"."uid"())))));



CREATE POLICY "Service role full access" ON "public"."bookings" USING (true);



CREATE POLICY "Users can insert their own events" ON "public"."listing_events" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR ("auth"."uid"() IS NULL)));



CREATE POLICY "Users can update their own basic profile fields" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own profile" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."catalog_search_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commercial_notification_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commercial_outcome_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commercial_outcomes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."images" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."indexing_submission_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_availability_confirmations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_lifecycle_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_quality_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_verification_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_verifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_watch_dispatches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_watchers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketplace_inquiries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketplace_inquiry_offer_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."new_balloon_quote_proposals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."newsletter_recipients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."newsletter_recovery_recipients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."newsletter_recovery_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."newsletter_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_notification_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."premium_alert_recipients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."premium_alert_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."premium_checkout_intents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quote_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seller_assistance_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seller_funnel_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vb_channel_price_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vb_compliance_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vb_compliance_items_service_role_all" ON "public"."vb_compliance_items" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."vb_consent_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vb_departures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vb_flight_attendance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vb_flight_signature_clearances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vb_inventory_holds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vb_meta" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vb_meta_service_role_all" ON "public"."vb_meta" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."vb_price_quotes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vb_pricing_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vb_pricing_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vb_rate_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vb_reservations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vb_reservations_service_role_all" ON "public"."vb_reservations" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."vb_storefront_checkouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vb_storefront_payment_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vb_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vb_users_service_role_all" ON "public"."vb_users" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."wanted_match_dispatches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wanted_requests" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_new_balloon_proposal_delivery"("p_proposal_id" "uuid", "p_provider_message_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_new_balloon_proposal_delivery"("p_proposal_id" "uuid", "p_provider_message_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_new_balloon_proposal_delivery"("p_proposal_id" "uuid", "p_provider_message_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."close_listing_by_actor"("p_listing_id" "uuid", "p_action" "text", "p_sale_channel" "text", "p_marketplace_inquiry_id" "uuid", "p_gross_amount_minor" bigint, "p_currency" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."close_listing_by_actor"("p_listing_id" "uuid", "p_action" "text", "p_sale_channel" "text", "p_marketplace_inquiry_id" "uuid", "p_gross_amount_minor" bigint, "p_currency" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."close_listing_by_actor"("p_listing_id" "uuid", "p_action" "text", "p_sale_channel" "text", "p_marketplace_inquiry_id" "uuid", "p_gross_amount_minor" bigint, "p_currency" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_listing_availability"("p_listing_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_listing_availability"("p_listing_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_listing_availability"("p_listing_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_listing_watch_by_service"("p_watcher_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_listing_watch_by_service"("p_watcher_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."decide_listing_verification"("p_listing_id" "uuid", "p_admin" "uuid", "p_action" "text", "p_identity_review_basis" "text", "p_supporting_evidence_types" "text"[], "p_decision_reason" "text", "p_review_scope_acknowledged" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decide_listing_verification"("p_listing_id" "uuid", "p_admin" "uuid", "p_action" "text", "p_identity_review_basis" "text", "p_supporting_evidence_types" "text"[], "p_decision_reason" "text", "p_review_scope_acknowledged" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_commercial_outcome_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_commercial_outcome_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_commercial_outcome_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_buyer_inquiry_response"("p_inquiry_id" "uuid", "p_responding_to_event_id" "uuid", "p_buyer_email" "text", "p_response" "text", "p_amount_minor" bigint, "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_buyer_inquiry_response"("p_inquiry_id" "uuid", "p_responding_to_event_id" "uuid", "p_buyer_email" "text", "p_response" "text", "p_amount_minor" bigint, "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_commercial_outcome"("p_entity_type" "text", "p_entity_id" "uuid", "p_outcome_type" "text", "p_currency" "text", "p_gross_amount_minor" bigint, "p_aerotrade_revenue_minor" bigint, "p_evidence_level" "text", "p_evidence_source" "text", "p_evidence_reference" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_commercial_outcome"("p_entity_type" "text", "p_entity_id" "uuid", "p_outcome_type" "text", "p_currency" "text", "p_gross_amount_minor" bigint, "p_aerotrade_revenue_minor" bigint, "p_evidence_level" "text", "p_evidence_source" "text", "p_evidence_reference" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_commercial_outcome"("p_entity_type" "text", "p_entity_id" "uuid", "p_outcome_type" "text", "p_currency" "text", "p_gross_amount_minor" bigint, "p_aerotrade_revenue_minor" bigint, "p_evidence_level" "text", "p_evidence_source" "text", "p_evidence_reference" "text", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_initial_marketplace_offer"() TO "anon";
GRANT ALL ON FUNCTION "public"."record_initial_marketplace_offer"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_initial_marketplace_offer"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_seller_inquiry_response"("p_inquiry_id" "uuid", "p_response" "text", "p_amount_minor" bigint, "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_seller_inquiry_response"("p_inquiry_id" "uuid", "p_response" "text", "p_amount_minor" bigint, "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_seller_inquiry_response"("p_inquiry_id" "uuid", "p_response" "text", "p_amount_minor" bigint, "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_listing_verification"("p_listing_id" "uuid", "p_requester" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_listing_verification"("p_listing_id" "uuid", "p_requester" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."vb_redeem_open_gift"("p_reservation_id" "text", "p_flight_date" "date", "p_passenger_details" "jsonb", "p_expected_external_ref" "text", "p_authorization_ref" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."vb_redeem_open_gift"("p_reservation_id" "text", "p_flight_date" "date", "p_passenger_details" "jsonb", "p_expected_external_ref" "text", "p_authorization_ref" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."vb_redeem_open_gift_internal_v1"("p_reservation_id" "text", "p_flight_date" "date", "p_passenger_details" "jsonb", "p_expected_external_ref" "text", "p_authorization_ref" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."vb_storefront_copy_checkout_attribution"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."vb_storefront_copy_checkout_attribution"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."vb_storefront_create_checkout"("p_quote_id" "uuid", "p_departure_id" "uuid", "p_product" "text", "p_contact" "jsonb", "p_passengers" "jsonb", "p_redsys_order" "text", "p_sandbox" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."vb_storefront_create_checkout"("p_quote_id" "uuid", "p_departure_id" "uuid", "p_product" "text", "p_contact" "jsonb", "p_passengers" "jsonb", "p_redsys_order" "text", "p_sandbox" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."vb_storefront_create_checkout_with_attribution"("p_quote_id" "uuid", "p_departure_id" "uuid", "p_product" "text", "p_contact" "jsonb", "p_passengers" "jsonb", "p_redsys_order" "text", "p_sandbox" boolean, "p_attribution" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."vb_storefront_create_checkout_with_attribution"("p_quote_id" "uuid", "p_departure_id" "uuid", "p_product" "text", "p_contact" "jsonb", "p_passengers" "jsonb", "p_redsys_order" "text", "p_sandbox" boolean, "p_attribution" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."vb_storefront_finalize_paid_checkout"("p_checkout_id" "uuid", "p_provider_response" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."vb_storefront_finalize_paid_checkout"("p_checkout_id" "uuid", "p_provider_response" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."catalog_search_events" TO "service_role";



GRANT ALL ON TABLE "public"."commercial_notification_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."commercial_outcome_events" TO "service_role";
GRANT SELECT ON TABLE "public"."commercial_outcome_events" TO "authenticated";



GRANT ALL ON TABLE "public"."commercial_outcomes" TO "service_role";



GRANT ALL ON TABLE "public"."images" TO "anon";
GRANT ALL ON TABLE "public"."images" TO "authenticated";
GRANT ALL ON TABLE "public"."images" TO "service_role";



GRANT ALL ON TABLE "public"."indexing_submission_receipts" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."listing_availability_confirmations" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."listing_availability_confirmations" TO "authenticated";
GRANT ALL ON TABLE "public"."listing_availability_confirmations" TO "service_role";



GRANT ALL ON TABLE "public"."listing_events" TO "anon";
GRANT ALL ON TABLE "public"."listing_events" TO "authenticated";
GRANT ALL ON TABLE "public"."listing_events" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."listing_lifecycle_events" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."listing_lifecycle_events" TO "authenticated";
GRANT ALL ON TABLE "public"."listing_lifecycle_events" TO "service_role";



GRANT ALL ON TABLE "public"."listing_quality_state" TO "service_role";



GRANT ALL ON TABLE "public"."listing_verification_events" TO "service_role";
GRANT SELECT ON TABLE "public"."listing_verification_events" TO "authenticated";



GRANT ALL ON TABLE "public"."listing_verifications" TO "service_role";
GRANT SELECT ON TABLE "public"."listing_verifications" TO "authenticated";



GRANT ALL ON TABLE "public"."listing_watch_dispatches" TO "service_role";



GRANT ALL ON TABLE "public"."listing_watchers" TO "service_role";



GRANT ALL ON TABLE "public"."listings" TO "anon";
GRANT ALL ON TABLE "public"."listings" TO "authenticated";
GRANT ALL ON TABLE "public"."listings" TO "service_role";



GRANT ALL ON TABLE "public"."marketplace_inquiries" TO "service_role";
GRANT SELECT ON TABLE "public"."marketplace_inquiries" TO "authenticated";



GRANT UPDATE("status") ON TABLE "public"."marketplace_inquiries" TO "authenticated";



GRANT UPDATE("last_activity_at") ON TABLE "public"."marketplace_inquiries" TO "authenticated";



GRANT UPDATE("closed_at") ON TABLE "public"."marketplace_inquiries" TO "authenticated";



GRANT UPDATE("updated_at") ON TABLE "public"."marketplace_inquiries" TO "authenticated";



GRANT ALL ON TABLE "public"."marketplace_inquiry_offer_events" TO "service_role";
GRANT SELECT ON TABLE "public"."marketplace_inquiry_offer_events" TO "authenticated";



GRANT ALL ON TABLE "public"."new_balloon_quote_proposals" TO "service_role";



GRANT ALL ON TABLE "public"."newsletter_recipients" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_recipients" TO "service_role";



GRANT ALL ON TABLE "public"."newsletter_recovery_recipients" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_recovery_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_recovery_recipients" TO "service_role";



GRANT ALL ON TABLE "public"."newsletter_recovery_runs" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_recovery_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_recovery_runs" TO "service_role";



GRANT ALL ON TABLE "public"."newsletter_runs" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_runs" TO "service_role";



GRANT ALL ON TABLE "public"."payment_notification_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."premium_alert_recipients" TO "anon";
GRANT ALL ON TABLE "public"."premium_alert_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."premium_alert_recipients" TO "service_role";



GRANT ALL ON TABLE "public"."premium_alert_runs" TO "anon";
GRANT ALL ON TABLE "public"."premium_alert_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."premium_alert_runs" TO "service_role";



GRANT ALL ON TABLE "public"."premium_checkout_intents" TO "service_role";



GRANT ALL ON TABLE "public"."quote_requests" TO "service_role";



GRANT ALL ON TABLE "public"."seller_assistance_requests" TO "service_role";



GRANT ALL ON TABLE "public"."seller_funnel_events" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."users" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT UPDATE("updated_at") ON TABLE "public"."users" TO "authenticated";



GRANT UPDATE("name") ON TABLE "public"."users" TO "authenticated";



GRANT UPDATE("phone") ON TABLE "public"."users" TO "authenticated";



GRANT ALL ON TABLE "public"."vb_automation_events" TO "anon";
GRANT ALL ON TABLE "public"."vb_automation_events" TO "authenticated";
GRANT ALL ON TABLE "public"."vb_automation_events" TO "service_role";



GRANT ALL ON TABLE "public"."vb_automation_tasks" TO "anon";
GRANT ALL ON TABLE "public"."vb_automation_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."vb_automation_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."vb_channel_price_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."vb_compliance_items" TO "service_role";



GRANT ALL ON TABLE "public"."vb_consent_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."vb_departures" TO "service_role";



GRANT ALL ON TABLE "public"."vb_flight_attendance" TO "service_role";



GRANT ALL ON TABLE "public"."vb_flight_signature_clearances" TO "service_role";



GRANT ALL ON TABLE "public"."vb_gift_tickets" TO "anon";
GRANT ALL ON TABLE "public"."vb_gift_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."vb_gift_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."vb_inventory_holds" TO "service_role";



GRANT ALL ON TABLE "public"."vb_message_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."vb_message_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."vb_message_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."vb_message_log" TO "anon";
GRANT ALL ON TABLE "public"."vb_message_log" TO "authenticated";
GRANT ALL ON TABLE "public"."vb_message_log" TO "service_role";



GRANT ALL ON TABLE "public"."vb_meta" TO "service_role";



GRANT ALL ON TABLE "public"."vb_price_quotes" TO "service_role";



GRANT ALL ON TABLE "public"."vb_pricing_events" TO "service_role";



GRANT ALL ON TABLE "public"."vb_pricing_rules" TO "service_role";



GRANT ALL ON TABLE "public"."vb_rate_plans" TO "service_role";



GRANT ALL ON TABLE "public"."vb_reservations" TO "service_role";



GRANT ALL ON TABLE "public"."vb_storefront_checkouts" TO "service_role";



GRANT ALL ON TABLE "public"."vb_storefront_payment_events" TO "service_role";



GRANT ALL ON TABLE "public"."vb_timeclock_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."vb_timeclock_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."vb_timeclock_adjustments" TO "service_role";



GRANT ALL ON TABLE "public"."vb_timeclock_employees" TO "anon";
GRANT ALL ON TABLE "public"."vb_timeclock_employees" TO "authenticated";
GRANT ALL ON TABLE "public"."vb_timeclock_employees" TO "service_role";



GRANT ALL ON TABLE "public"."vb_timeclock_punches" TO "anon";
GRANT ALL ON TABLE "public"."vb_timeclock_punches" TO "authenticated";
GRANT ALL ON TABLE "public"."vb_timeclock_punches" TO "service_role";



GRANT ALL ON TABLE "public"."vb_users" TO "service_role";



GRANT ALL ON TABLE "public"."vb_whatsapp_contacts" TO "anon";
GRANT ALL ON TABLE "public"."vb_whatsapp_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."vb_whatsapp_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."vb_whatsapp_conversation_events" TO "anon";
GRANT ALL ON TABLE "public"."vb_whatsapp_conversation_events" TO "authenticated";
GRANT ALL ON TABLE "public"."vb_whatsapp_conversation_events" TO "service_role";



GRANT ALL ON TABLE "public"."vb_whatsapp_conversation_reservations" TO "anon";
GRANT ALL ON TABLE "public"."vb_whatsapp_conversation_reservations" TO "authenticated";
GRANT ALL ON TABLE "public"."vb_whatsapp_conversation_reservations" TO "service_role";



GRANT ALL ON TABLE "public"."vb_whatsapp_conversations" TO "anon";
GRANT ALL ON TABLE "public"."vb_whatsapp_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."vb_whatsapp_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."wanted_match_dispatches" TO "service_role";



GRANT ALL ON TABLE "public"."wanted_requests" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






