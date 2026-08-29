create table public.listing_availability_confirmations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  seller_id uuid not null references public.users(id) on delete restrict,
  listing_status text not null check (listing_status in ('ACTIVE_PUBLIC', 'ACTIVE_PREMIUM')),
  source text not null default 'SELLER_DASHBOARD' check (source in ('SELLER_DASHBOARD')),
  confirmed_on date not null default current_date,
  confirmed_at timestamptz not null default now(),
  unique (listing_id, confirmed_on)
);

create index listing_availability_confirmations_latest_idx
  on public.listing_availability_confirmations (listing_id, confirmed_at desc);

alter table public.listing_availability_confirmations enable row level security;

create policy "Sellers can read own availability confirmations"
  on public.listing_availability_confirmations for select to authenticated
  using (seller_id = auth.uid());

create policy "Admins can read availability confirmations"
  on public.listing_availability_confirmations for select to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

revoke insert, update, delete on public.listing_availability_confirmations from anon, authenticated;

create or replace function public.confirm_listing_availability(p_listing_id uuid)
returns table(confirmation_id uuid, confirmed_at timestamptz, confirmed_on date)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

revoke all on function public.confirm_listing_availability(uuid) from public, anon;
grant execute on function public.confirm_listing_availability(uuid) to authenticated;

