-- Preserve the immutable listing closure while allowing one later, equally
-- immutable clarification when the original sale channel was not disclosed.

create table if not exists public.listing_sale_clarifications (
  id uuid primary key default uuid_generate_v4(),
  lifecycle_event_id uuid not null unique references public.listing_lifecycle_events(id) on delete restrict,
  listing_id uuid not null unique references public.listings(id) on delete restrict,
  recorded_by uuid not null references public.users(id) on delete restrict,
  actor_role text not null check (actor_role = 'ADMIN'),
  sale_channel text not null check (sale_channel in ('AEROTRADE', 'OTHER_CHANNEL')),
  marketplace_inquiry_id uuid references public.marketplace_inquiries(id) on delete restrict,
  gross_amount_minor bigint check (gross_amount_minor is null or gross_amount_minor > 0),
  currency text check (currency is null or currency in ('EUR', 'GBP', 'USD')),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint listing_sale_clarification_consistency check (
    ((sale_channel = 'AEROTRADE' and marketplace_inquiry_id is not null)
      or (sale_channel = 'OTHER_CHANNEL' and marketplace_inquiry_id is null))
    and ((gross_amount_minor is null and currency is null)
      or (gross_amount_minor is not null and currency is not null))
  )
);

create index if not exists listing_sale_clarifications_created_idx
  on public.listing_sale_clarifications (created_at desc);

alter table public.listing_sale_clarifications enable row level security;
revoke all on public.listing_sale_clarifications from public, anon, authenticated;
grant select on public.listing_sale_clarifications to authenticated;

create policy "Admins can read listing sale clarifications"
  on public.listing_sale_clarifications for select to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create or replace function public.reject_listing_sale_clarification_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Listing sale clarifications are append-only';
end;
$$;

drop trigger if exists prevent_listing_sale_clarification_mutation on public.listing_sale_clarifications;
create trigger prevent_listing_sale_clarification_mutation
  before update or delete on public.listing_sale_clarifications
  for each row execute procedure public.reject_listing_sale_clarification_mutation();

create or replace function public.clarify_listing_sale_by_admin(
  p_lifecycle_event_id uuid,
  p_sale_channel text,
  p_marketplace_inquiry_id uuid default null,
  p_gross_amount_minor bigint default null,
  p_currency text default null
)
returns table(clarification_id uuid, effective_sale_channel text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_event public.listing_lifecycle_events%rowtype;
  v_listing public.listings%rowtype;
  v_channel text := upper(nullif(btrim(p_sale_channel), ''));
  v_currency text := upper(nullif(btrim(p_currency), ''));
  v_id uuid;
begin
  if v_actor is null or not exists (select 1 from public.users where id = v_actor and role = 'admin') then
    raise exception 'Administrator authorization is required';
  end if;

  select * into v_event from public.listing_lifecycle_events where id = p_lifecycle_event_id for update;
  if v_event.id is null or v_event.event_type <> 'SOLD' or v_event.sale_channel <> 'NOT_DISCLOSED' then
    raise exception 'Only an undisclosed sale can be clarified';
  end if;
  select * into v_listing from public.listings where id = v_event.listing_id for share;
  if v_listing.id is null or v_listing.status <> 'SOLD' then raise exception 'The listing is not closed as sold'; end if;
  if exists (select 1 from public.listing_sale_clarifications where lifecycle_event_id = v_event.id) then
    raise exception 'The sale channel has already been clarified';
  end if;
  if v_channel not in ('AEROTRADE', 'OTHER_CHANNEL') then raise exception 'Invalid clarified sale channel'; end if;
  if v_channel = 'AEROTRADE' then
    if p_marketplace_inquiry_id is null or not exists (
      select 1 from public.marketplace_inquiries
      where id = p_marketplace_inquiry_id and listing_id = v_event.listing_id and status <> 'SPAM'
    ) then raise exception 'An AeroTrade clarification requires a matching non-spam enquiry'; end if;
  elsif p_marketplace_inquiry_id is not null then
    raise exception 'Only an AeroTrade clarification can reference an enquiry';
  end if;
  if (p_gross_amount_minor is null) <> (v_currency is null) then raise exception 'Sale amount and currency must be provided together'; end if;
  if p_gross_amount_minor is not null and (p_gross_amount_minor <= 0 or v_currency <> v_listing.currency) then
    raise exception 'Invalid sale amount or currency';
  end if;

  insert into public.listing_sale_clarifications (
    lifecycle_event_id, listing_id, recorded_by, actor_role, sale_channel,
    marketplace_inquiry_id, gross_amount_minor, currency
  ) values (
    v_event.id, v_event.listing_id, v_actor, 'ADMIN', v_channel,
    p_marketplace_inquiry_id, p_gross_amount_minor, v_currency
  ) returning id into v_id;

  return query select v_id, v_channel;
end;
$$;

revoke all on function public.clarify_listing_sale_by_admin(uuid,text,uuid,bigint,text) from public, anon;
grant execute on function public.clarify_listing_sale_by_admin(uuid,text,uuid,bigint,text) to authenticated;

comment on table public.listing_sale_clarifications is
  'One append-only administrator clarification of an originally undisclosed listing sale. It never rewrites closure evidence, creates revenue or reopens inventory.';
comment on function public.clarify_listing_sale_by_admin(uuid,text,uuid,bigint,text) is
  'Adds one evidence-gated channel clarification to an immutable undisclosed sale; never creates a commercial outcome or revenue.';
