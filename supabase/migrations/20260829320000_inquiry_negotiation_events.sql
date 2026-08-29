-- Structured, explicitly non-binding negotiation evidence for the existing
-- marketplace enquiry. It does not reserve equipment, execute payment or form
-- a sale contract. Buyer PII remains on the private parent enquiry.

alter table public.marketplace_inquiries
  add column if not exists currency text,
  add column if not exists initial_offer_amount_minor bigint;

update public.marketplace_inquiries as inquiry
set currency = listing.currency
from public.listings as listing
where listing.id = inquiry.listing_id
  and inquiry.currency is null;

alter table public.marketplace_inquiries
  alter column currency set default 'EUR',
  alter column currency set not null,
  drop constraint if exists marketplace_inquiries_currency_check,
  drop constraint if exists marketplace_inquiries_initial_offer_check;

alter table public.marketplace_inquiries
  add constraint marketplace_inquiries_currency_check
    check (currency in ('EUR', 'GBP', 'USD')),
  add constraint marketplace_inquiries_initial_offer_check
    check (initial_offer_amount_minor is null or initial_offer_amount_minor > 0);

create table if not exists public.marketplace_inquiry_offer_events (
  id uuid default uuid_generate_v4() primary key,
  inquiry_id uuid not null references public.marketplace_inquiries(id) on delete cascade,
  event_type text not null check (event_type in (
    'BUYER_OFFERED',
    'SELLER_ACCEPTED_FOR_NEGOTIATION',
    'SELLER_COUNTERED',
    'SELLER_DECLINED'
  )),
  actor_role text not null check (actor_role in ('BUYER', 'SELLER', 'ADMIN')),
  actor_user_id uuid references public.users(id) on delete set null,
  amount_minor bigint,
  currency text not null check (currency in ('EUR', 'GBP', 'USD')),
  note text check (note is null or char_length(note) <= 1000),
  buyer_notification_status text not null default 'pending'
    check (buyer_notification_status in ('pending', 'accepted', 'failed', 'not_required')),
  buyer_notification_provider_id text,
  buyer_notification_error text,
  idempotency_key text unique,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint marketplace_inquiry_offer_amount_consistency check (
    (event_type in ('BUYER_OFFERED', 'SELLER_COUNTERED') and amount_minor > 0)
    or (event_type in ('SELLER_ACCEPTED_FOR_NEGOTIATION', 'SELLER_DECLINED') and amount_minor is null)
  ),
  constraint marketplace_inquiry_offer_actor_consistency check (
    (event_type = 'BUYER_OFFERED' and actor_role = 'BUYER')
    or (event_type <> 'BUYER_OFFERED' and actor_role in ('SELLER', 'ADMIN'))
  )
);

create index if not exists marketplace_inquiry_offer_events_inquiry_created_idx
  on public.marketplace_inquiry_offer_events (inquiry_id, created_at desc);
create index if not exists marketplace_inquiry_offer_events_attention_idx
  on public.marketplace_inquiry_offer_events (buyer_notification_status, created_at desc)
  where buyer_notification_status in ('pending', 'failed');

alter table public.marketplace_inquiry_offer_events enable row level security;
revoke all on public.marketplace_inquiry_offer_events from anon, authenticated;
grant select on public.marketplace_inquiry_offer_events to authenticated;

drop policy if exists "Sellers can view negotiation events for their listings" on public.marketplace_inquiry_offer_events;
create policy "Sellers can view negotiation events for their listings"
  on public.marketplace_inquiry_offer_events for select to authenticated
  using (
    exists (
      select 1
      from public.marketplace_inquiries as inquiry
      join public.listings as listing on listing.id = inquiry.listing_id
      where inquiry.id = marketplace_inquiry_offer_events.inquiry_id
        and listing.seller_id = auth.uid()
    )
  );

drop policy if exists "Admins can manage marketplace negotiation events" on public.marketplace_inquiry_offer_events;
create policy "Admins can manage marketplace negotiation events"
  on public.marketplace_inquiry_offer_events for all to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create or replace function public.record_initial_marketplace_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

drop trigger if exists record_initial_marketplace_offer on public.marketplace_inquiries;
create trigger record_initial_marketplace_offer
  after insert on public.marketplace_inquiries
  for each row execute procedure public.record_initial_marketplace_offer();

create or replace function public.record_seller_inquiry_response(
  p_inquiry_id uuid,
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

revoke all on function public.record_seller_inquiry_response(uuid, text, bigint, text) from public, anon;
grant execute on function public.record_seller_inquiry_response(uuid, text, bigint, text) to authenticated;

alter table public.commercial_notification_receipts
  drop constraint if exists commercial_notification_receipts_notification_type_check;

alter table public.commercial_notification_receipts
  add constraint commercial_notification_receipts_notification_type_check
    check (notification_type in (
      'listing_created_admin', 'quote_created_admin', 'wanted_request_admin',
      'listing_quality_quarantine', 'inquiry_buyer_ack',
      'inquiry_seller_followup', 'inquiry_buyer_seller_response',
      'quote_admin_followup', 'premium_listing_checkout_recovery',
      'wanted_match_buyer', 'listing_verification_requested',
      'listing_verification_decision', 'seller_assistance_created_admin',
      'seller_assistance_admin_followup'
    ));

comment on table public.marketplace_inquiry_offer_events is
  'Private non-binding negotiation evidence. It never reserves equipment, executes payment or forms a sale contract.';
comment on column public.marketplace_inquiries.initial_offer_amount_minor is
  'Optional buyer price indication in minor units; expressly non-binding.';

