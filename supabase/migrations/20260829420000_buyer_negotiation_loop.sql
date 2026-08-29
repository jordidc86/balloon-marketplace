-- Close the existing non-binding negotiation loop so a buyer can respond to
-- one specific seller event through a time-limited emailed capability. This
-- remains private and cannot reserve equipment, move money or form a contract.

alter table public.marketplace_inquiry_offer_events
  add column if not exists responding_to_event_id uuid references public.marketplace_inquiry_offer_events(id) on delete restrict,
  add column if not exists seller_notification_status text not null default 'not_required',
  add column if not exists seller_notification_provider_id text,
  add column if not exists seller_notification_error text;

alter table public.marketplace_inquiry_offer_events
  drop constraint if exists marketplace_inquiry_offer_events_event_type_check,
  drop constraint if exists marketplace_inquiry_offer_amount_consistency,
  drop constraint if exists marketplace_inquiry_offer_actor_consistency,
  drop constraint if exists marketplace_inquiry_offer_events_seller_notification_status_check,
  drop constraint if exists marketplace_inquiry_offer_response_target_consistency;

alter table public.marketplace_inquiry_offer_events
  add constraint marketplace_inquiry_offer_events_event_type_check check (event_type in (
    'BUYER_OFFERED','BUYER_ACCEPTED_FOR_NEGOTIATION','BUYER_COUNTERED','BUYER_DECLINED',
    'SELLER_ACCEPTED_FOR_NEGOTIATION','SELLER_COUNTERED','SELLER_DECLINED'
  )),
  add constraint marketplace_inquiry_offer_amount_consistency check (
    (event_type in ('BUYER_OFFERED','BUYER_COUNTERED','SELLER_COUNTERED') and amount_minor > 0)
    or (event_type in ('BUYER_ACCEPTED_FOR_NEGOTIATION','BUYER_DECLINED','SELLER_ACCEPTED_FOR_NEGOTIATION','SELLER_DECLINED') and amount_minor is null)
  ),
  add constraint marketplace_inquiry_offer_actor_consistency check (
    (event_type in ('BUYER_OFFERED','BUYER_ACCEPTED_FOR_NEGOTIATION','BUYER_COUNTERED','BUYER_DECLINED') and actor_role = 'BUYER')
    or (event_type in ('SELLER_ACCEPTED_FOR_NEGOTIATION','SELLER_COUNTERED','SELLER_DECLINED') and actor_role in ('SELLER','ADMIN'))
  ),
  add constraint marketplace_inquiry_offer_events_seller_notification_status_check check (
    seller_notification_status in ('pending','accepted','failed','not_required')
  ),
  add constraint marketplace_inquiry_offer_response_target_consistency check (
    (event_type in ('BUYER_ACCEPTED_FOR_NEGOTIATION','BUYER_COUNTERED','BUYER_DECLINED') and responding_to_event_id is not null and seller_notification_status in ('pending','accepted','failed') and buyer_notification_status = 'not_required')
    or (event_type not in ('BUYER_ACCEPTED_FOR_NEGOTIATION','BUYER_COUNTERED','BUYER_DECLINED') and responding_to_event_id is null and seller_notification_status = 'not_required')
  );

create unique index if not exists marketplace_inquiry_one_buyer_response_per_seller_event
  on public.marketplace_inquiry_offer_events (responding_to_event_id)
  where responding_to_event_id is not null;

create index if not exists marketplace_inquiry_offer_seller_attention_idx
  on public.marketplace_inquiry_offer_events (seller_notification_status, created_at desc)
  where seller_notification_status in ('pending','failed');

create or replace function public.record_buyer_inquiry_response(
  p_inquiry_id uuid,
  p_responding_to_event_id uuid,
  p_buyer_email text,
  p_response text,
  p_amount_minor bigint default null,
  p_note text default null
)
returns table(event_id uuid, inquiry_status text, notification_status text)
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.record_buyer_inquiry_response(uuid, uuid, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.record_buyer_inquiry_response(uuid, uuid, text, text, bigint, text) to service_role;

alter table public.commercial_notification_receipts
  drop constraint if exists commercial_notification_receipts_notification_type_check;

alter table public.commercial_notification_receipts
  add constraint commercial_notification_receipts_notification_type_check check (notification_type in (
    'listing_created_admin','quote_created_admin','wanted_request_admin','listing_quality_quarantine','inquiry_buyer_ack',
    'inquiry_seller_followup','inquiry_buyer_seller_response','inquiry_seller_buyer_response','quote_admin_followup','premium_listing_checkout_recovery',
    'wanted_match_buyer','listing_verification_requested','listing_verification_decision','seller_assistance_created_admin',
    'seller_assistance_admin_followup','new_balloon_proposal_buyer','listing_watch_confirmation','listing_watch_update'
  ));

comment on function public.record_buyer_inquiry_response(uuid, uuid, text, text, bigint, text) is
  'Service-only atomic buyer response to one current seller negotiation event. Authorization is verified by the application capability before calling.';
