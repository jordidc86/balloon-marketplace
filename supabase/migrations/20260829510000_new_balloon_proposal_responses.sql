create table if not exists public.new_balloon_proposal_response_events (
  id uuid default extensions.uuid_generate_v4() primary key,
  proposal_id uuid not null unique references public.new_balloon_quote_proposals(id) on delete restrict,
  quote_request_id uuid not null references public.quote_requests(id) on delete restrict,
  response_type text not null check (response_type in ('INTERESTED', 'QUESTION', 'DECLINED')),
  note text check (note is null or char_length(note) <= 1000),
  admin_notification_status text not null default 'pending' check (admin_notification_status in ('pending', 'accepted', 'failed')),
  admin_notification_provider_id text,
  admin_notification_error text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  check (response_type <> 'QUESTION' or char_length(coalesce(note, '')) >= 5),
  check (admin_notification_status <> 'accepted' or admin_notification_provider_id is not null)
);

create index if not exists new_balloon_proposal_response_events_quote_created_idx
  on public.new_balloon_proposal_response_events (quote_request_id, created_at desc);

alter table public.new_balloon_proposal_response_events enable row level security;
revoke all on public.new_balloon_proposal_response_events from anon, authenticated;

alter table public.quote_requests
  drop constraint if exists quote_requests_status_check;
alter table public.quote_requests
  add constraint quote_requests_status_check check (status in (
    'NEW', 'CONTACTED', 'SENT_TO_PARTNER', 'QUOTE_SENT', 'BUYER_RESPONDED', 'WON', 'LOST'
  ));

create or replace function public.record_new_balloon_proposal_response(
  p_proposal_id uuid,
  p_buyer_email text,
  p_response_type text,
  p_note text default null
)
returns table(event_id uuid, response_type text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote_id uuid;
  v_delivery_status text;
  v_valid_until date;
  v_quote_email text;
  v_quote_status text;
  v_existing public.new_balloon_proposal_response_events%rowtype;
  v_event_id uuid;
  v_response_type text := upper(btrim(coalesce(p_response_type, '')));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_buyer_email is null or char_length(btrim(p_buyer_email)) not between 3 and 320 then
    raise exception 'Invalid buyer identity';
  end if;
  if v_response_type not in ('INTERESTED', 'QUESTION', 'DECLINED') then
    raise exception 'Invalid proposal response';
  end if;
  if char_length(coalesce(v_note, '')) > 1000 or (v_response_type = 'QUESTION' and char_length(coalesce(v_note, '')) < 5) then
    raise exception 'Invalid response note';
  end if;

  select p.quote_request_id, p.delivery_status, p.valid_until,
         q.email, q.status
    into v_quote_id, v_delivery_status, v_valid_until, v_quote_email, v_quote_status
    from public.new_balloon_quote_proposals p
    join public.quote_requests q on q.id = p.quote_request_id
   where p.id = p_proposal_id
   for update of p, q;

  if not found then raise exception 'Proposal not found'; end if;
  if v_delivery_status <> 'accepted' then raise exception 'Proposal delivery is not accepted'; end if;
  if v_valid_until < (timezone('utc'::text, now()))::date then raise exception 'Proposal response window has expired'; end if;
  if v_quote_status in ('WON', 'LOST') then raise exception 'Quote request is closed'; end if;
  if lower(btrim(v_quote_email)) <> lower(btrim(p_buyer_email)) then raise exception 'Buyer identity mismatch'; end if;

  select * into v_existing
    from public.new_balloon_proposal_response_events
   where proposal_id = p_proposal_id;
  if found then
    if v_existing.response_type <> v_response_type or coalesce(v_existing.note, '') <> coalesce(v_note, '') then
      raise exception 'A different response is already recorded';
    end if;
    return query select v_existing.id, v_existing.response_type;
    return;
  end if;

  insert into public.new_balloon_proposal_response_events (
    proposal_id, quote_request_id, response_type, note
  ) values (
    p_proposal_id, v_quote_id, v_response_type, v_note
  ) returning id into v_event_id;

  update public.quote_requests
     set status = 'BUYER_RESPONDED',
         updated_at = timezone('utc'::text, now())
   where id = v_quote_id;

  return query select v_event_id, v_response_type;
end;
$$;

revoke all on function public.record_new_balloon_proposal_response(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.record_new_balloon_proposal_response(uuid,text,text,text) to service_role;

alter table public.commercial_notification_receipts
  drop constraint if exists commercial_notification_receipts_notification_type_check;

alter table public.commercial_notification_receipts
  add constraint commercial_notification_receipts_notification_type_check check (notification_type in (
    'listing_created_admin','quote_created_admin','wanted_request_admin','listing_quality_quarantine','inquiry_buyer_ack',
    'inquiry_seller_followup','inquiry_buyer_seller_response','inquiry_seller_buyer_response','quote_admin_followup','premium_listing_checkout_recovery',
    'wanted_match_buyer','listing_verification_requested','listing_verification_decision','seller_assistance_created_admin',
    'seller_assistance_admin_followup','new_balloon_proposal_buyer','new_balloon_buyer_ack','listing_watch_confirmation','listing_watch_update',
    'listing_availability_request','new_balloon_proposal_response_admin','new_balloon_proposal_response_followup'
  ));

comment on table public.new_balloon_proposal_response_events is
  'One immutable, non-binding buyer response to an accepted indicative new-balloon proposal. It never creates an order, reservation, payment or contract.';
comment on function public.record_new_balloon_proposal_response(uuid,text,text,text) is
  'Records one idempotent response after service-side capability verification and exact buyer/proposal readback. BUYER_RESPONDED exposes the action queue but commercial closure remains administrator-only.';
