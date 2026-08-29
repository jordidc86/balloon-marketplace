create table public.listing_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete restrict unique,
  seller_id uuid not null references public.users(id) on delete restrict,
  recorded_by uuid not null references public.users(id) on delete restrict,
  actor_role text not null check (actor_role in ('SELLER', 'ADMIN')),
  event_type text not null check (event_type in ('SOLD', 'WITHDRAWN')),
  sale_channel text check (sale_channel in ('AEROTRADE', 'OTHER_CHANNEL', 'NOT_DISCLOSED')),
  marketplace_inquiry_id uuid references public.marketplace_inquiries(id) on delete restrict,
  gross_amount_minor bigint check (gross_amount_minor is null or gross_amount_minor > 0),
  currency text check (currency is null or currency in ('EUR', 'GBP', 'USD')),
  previous_status text not null check (previous_status in ('DRAFT', 'PENDING_PAYMENT', 'ACTIVE_PREMIUM', 'ACTIVE_PUBLIC')),
  new_status text not null check (new_status in ('SOLD', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  constraint listing_lifecycle_event_consistency check (
    (
      event_type = 'WITHDRAWN'
      and sale_channel is null
      and marketplace_inquiry_id is null
      and gross_amount_minor is null
      and currency is null
      and new_status = 'ARCHIVED'
    )
    or
    (
      event_type = 'SOLD'
      and sale_channel is not null
      and new_status = 'SOLD'
      and (
        (sale_channel = 'AEROTRADE' and marketplace_inquiry_id is not null)
        or (sale_channel <> 'AEROTRADE' and marketplace_inquiry_id is null)
      )
      and ((gross_amount_minor is null and currency is null) or (gross_amount_minor is not null and currency is not null))
    )
  )
);

create index listing_lifecycle_events_created_idx
  on public.listing_lifecycle_events (created_at desc);

alter table public.listing_lifecycle_events enable row level security;

create policy "Sellers can read own listing lifecycle"
  on public.listing_lifecycle_events for select to authenticated
  using (seller_id = auth.uid());

create policy "Admins can read listing lifecycle"
  on public.listing_lifecycle_events for select to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

revoke insert, update, delete on public.listing_lifecycle_events from anon, authenticated;

create or replace function public.close_listing_by_actor(
  p_listing_id uuid,
  p_action text,
  p_sale_channel text default null,
  p_marketplace_inquiry_id uuid default null,
  p_gross_amount_minor bigint default null,
  p_currency text default null
)
returns table(event_id uuid, listing_status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

revoke all on function public.close_listing_by_actor(uuid,text,text,uuid,bigint,text) from public, anon;
grant execute on function public.close_listing_by_actor(uuid,text,text,uuid,bigint,text) to authenticated;

comment on function public.close_listing_by_actor(uuid,text,text,uuid,bigint,text) is
  'Atomically closes an owner listing with immutable seller/admin attribution. A seller report never creates revenue or changes an enquiry outcome.';
