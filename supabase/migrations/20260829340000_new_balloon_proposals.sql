create table if not exists public.new_balloon_quote_proposals (
  id uuid default uuid_generate_v4() primary key,
  quote_request_id uuid not null references public.quote_requests(id) on delete restrict,
  proposal_fingerprint text not null unique check (char_length(proposal_fingerprint) = 64),
  manufacturer text not null check (manufacturer in ('pasha', 'schroeder')),
  currency text not null check (currency in ('EUR', 'GBP', 'USD')),
  amount_min_minor bigint not null check (amount_min_minor > 0),
  amount_max_minor bigint not null check (amount_max_minor >= amount_min_minor),
  configuration_summary text not null check (char_length(configuration_summary) between 20 and 2000),
  delivery_guidance text not null check (char_length(delivery_guidance) between 5 and 500),
  valid_until date not null,
  terms text check (terms is null or char_length(terms) <= 2000),
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'accepted', 'failed')),
  provider_message_id text,
  delivery_error text,
  recorded_by uuid not null references public.users(id) on delete restrict,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  check ((delivery_status = 'accepted') = (accepted_at is not null)),
  check (delivery_status <> 'accepted' or provider_message_id is not null)
);

create index if not exists new_balloon_quote_proposals_request_created_idx on public.new_balloon_quote_proposals (quote_request_id, created_at desc);
create trigger set_new_balloon_quote_proposals_updated_at before update on public.new_balloon_quote_proposals for each row execute procedure public.set_updated_at();
alter table public.new_balloon_quote_proposals enable row level security;
revoke all on public.new_balloon_quote_proposals from anon, authenticated;
drop policy if exists "Admins can manage new balloon proposals" on public.new_balloon_quote_proposals;
create policy "Admins can manage new balloon proposals" on public.new_balloon_quote_proposals for all to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create or replace function public.accept_new_balloon_proposal_delivery(p_proposal_id uuid, p_provider_message_id text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
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
revoke all on function public.accept_new_balloon_proposal_delivery(uuid,text) from public, anon;
grant execute on function public.accept_new_balloon_proposal_delivery(uuid,text) to authenticated;

alter table public.commercial_notification_receipts
  drop constraint if exists commercial_notification_receipts_notification_type_check,
  drop constraint if exists commercial_notification_receipts_entity_type_check;
alter table public.commercial_notification_receipts add constraint commercial_notification_receipts_notification_type_check check (notification_type in (
  'listing_created_admin','quote_created_admin','wanted_request_admin','listing_quality_quarantine','inquiry_buyer_ack',
  'inquiry_seller_followup','inquiry_buyer_seller_response','quote_admin_followup','premium_listing_checkout_recovery',
  'wanted_match_buyer','listing_verification_requested','listing_verification_decision','seller_assistance_created_admin',
  'seller_assistance_admin_followup','new_balloon_proposal_buyer'
)), add constraint commercial_notification_receipts_entity_type_check check (entity_type in (
  'listing','quote_request','wanted_request','inquiry','seller_assistance','quote_proposal'
));
