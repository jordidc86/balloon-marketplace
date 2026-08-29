alter table public.listing_watchers
  add column if not exists closed_at timestamp with time zone;

alter table public.listing_watchers
  drop constraint if exists listing_watchers_status_check,
  drop constraint if exists listing_watchers_confirmation_state;

alter table public.listing_watchers
  add constraint listing_watchers_status_check check (
    status in ('PENDING_CONFIRMATION', 'ACTIVE', 'UNSUBSCRIBED', 'BLOCKED', 'LISTING_CLOSED')
  ),
  add constraint listing_watchers_confirmation_state check (
    (status = 'ACTIVE' and confirmed_at is not null and unsubscribed_at is null and closed_at is null)
    or (status = 'UNSUBSCRIBED' and unsubscribed_at is not null and closed_at is null)
    or (status = 'LISTING_CLOSED' and closed_at is not null and unsubscribed_at is null)
    or (status in ('PENDING_CONFIRMATION', 'BLOCKED') and closed_at is null)
  );

comment on column public.listing_watchers.closed_at is
  'Terminal time after the watched listing becomes SOLD or ARCHIVED. ACTIVE is retained until the final requested operational update is provider-accepted.';

create or replace function public.confirm_listing_watch_by_service(p_watcher_id uuid)
returns table(outcome text, watcher_status text, confirmed_at timestamp with time zone, closed_at timestamp with time zone)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

revoke all on function public.confirm_listing_watch_by_service(uuid) from public, anon, authenticated;
grant execute on function public.confirm_listing_watch_by_service(uuid) to service_role;

comment on function public.confirm_listing_watch_by_service(uuid) is
  'Atomically confirms one token-verified watch through the service role, or retires it when its listing is already SOLD or ARCHIVED.';
