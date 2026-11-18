-- Forward-only publication receipts; deliberately no historical email backfill.
alter table public.users add column listing_alerts_enabled boolean not null default true;

create table public.listing_publication_alerts (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  published_at timestamptz not null default now(),
  status text not null default 'pending' check(status in ('pending','completed','attention')),
  completed_at timestamptz
);
alter table public.listing_publication_alerts enable row level security;
revoke all on public.listing_publication_alerts from public,anon,authenticated;
grant all on public.listing_publication_alerts to service_role;

create function public.queue_listing_publication_alert() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('ACTIVE_PUBLIC','ACTIVE_PREMIUM') and
    (tg_op='INSERT' or old.status in ('DRAFT','PENDING_PAYMENT')) then
    insert into public.listing_publication_alerts(listing_id) values(new.id)
      on conflict(listing_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.queue_listing_publication_alert() from public,anon,authenticated;
grant execute on function public.queue_listing_publication_alert() to service_role;
create trigger queue_listing_publication_alert after insert or update of status on public.listings
for each row execute function public.queue_listing_publication_alert();

create table public.saved_catalog_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  query text not null default '' check(length(query)<=100),
  category text not null default '' check(category in ('','complete','envelopes','baskets','burners','bottom-end','cylinders','other-equipment')),
  country text not null default '' check(length(country)<=100),
  manufacturer text not null default '' check(length(manufacturer)<=60),
  active boolean not null default true,
  seen_keys text[] not null default '{}' check(cardinality(seen_keys)<=10000),
  last_checked_day date,
  created_at timestamptz not null default now(),
  unique(user_id,query,category,country,manufacturer),
  check(length(query||category||country||manufacturer)>0)
);
alter table public.saved_catalog_searches enable row level security;
revoke all on public.saved_catalog_searches from public,anon,authenticated;
grant select on public.saved_catalog_searches to authenticated;
grant all on public.saved_catalog_searches to service_role;
create policy "Read own saved searches" on public.saved_catalog_searches for select to authenticated using(user_id=auth.uid());

create table public.saved_search_digests (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.saved_catalog_searches(id) on delete cascade,
  day date not null,
  items jsonb not null check(jsonb_typeof(items)='array'),
  match_count integer not null check(match_count>0),
  status text not null default 'prepared' check(status in ('prepared','sending','accepted','failed','uncertain','cancelled')),
  provider_message_id text,
  created_at timestamptz not null default now(),
  attempted_at timestamptz,
  accepted_at timestamptz,
  unique(search_id,day)
);
alter table public.saved_search_digests enable row level security;
revoke all on public.saved_search_digests from public,anon,authenticated;
grant all on public.saved_search_digests to service_role;

-- Service-only operations keep browser writes out of the data API. The server
-- supplies user_id only after verifying the actual authenticated session.
create function public.create_saved_catalog_search(p_user_id uuid,p_query text,p_category text,p_country text,p_manufacturer text,p_seen_keys text[])
returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service role required'; end if;
  perform id from public.users where id=p_user_id and is_premium for update;
  if not found then raise exception 'Premium is required'; end if;
  if (select count(*) from public.saved_catalog_searches where user_id=p_user_id)>=5 then raise exception 'You can save up to five searches'; end if;
  insert into public.saved_catalog_searches(user_id,query,category,country,manufacturer,seen_keys)
  values(p_user_id,p_query,p_category,p_country,p_manufacturer,p_seen_keys) returning id into result;
  return result;
end $$;
revoke all on function public.create_saved_catalog_search(uuid,text,text,text,text,text[]) from public,anon,authenticated;
grant execute on function public.create_saved_catalog_search(uuid,text,text,text,text,text[]) to service_role;

create function public.prepare_saved_search_digest(p_search_id uuid,p_day date,p_matches jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare search public.saved_catalog_searches%rowtype; fresh jsonb; keys text[]; result uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service role required'; end if;
  if p_day is null or p_matches is null or p_day<>(now() at time zone 'UTC')::date or jsonb_typeof(p_matches)<>'array' or jsonb_array_length(p_matches)>10000 then raise exception 'Invalid digest input'; end if;
  select * into search from public.saved_catalog_searches where id=p_search_id for update;
  if not found or not search.active or not exists(select 1 from public.users where id=search.user_id and is_premium) then return null; end if;
  select id into result from public.saved_search_digests where search_id=p_search_id and day=p_day;
  if result is not null then return result; end if;
  if search.last_checked_day>=p_day then return null; end if;
  select coalesce(jsonb_agg(item),'[]'::jsonb),array_agg(item->>'key') into fresh,keys
    from (select distinct on(item->>'key') item from jsonb_array_elements(p_matches) item
      where item->>'key' is not null and not (item->>'key'=any(search.seen_keys)) order by item->>'key') matches;
  if cardinality(search.seen_keys)+coalesce(cardinality(keys),0)>10000 then raise exception 'Saved search history limit reached'; end if;
  update public.saved_catalog_searches set last_checked_day=p_day,
    seen_keys=seen_keys||coalesce(keys,'{}'::text[]) where id=p_search_id;
  if jsonb_array_length(fresh)=0 then return null; end if;
  -- Freeze both the selection and seen keys before dispatch. An uncertain
  -- provider response never causes the same matches to be sent the next day.
  insert into public.saved_search_digests(search_id,day,items,match_count)
  values(p_search_id,p_day,(select jsonb_agg(value) from (select value from jsonb_array_elements(fresh) limit 20) chosen),jsonb_array_length(fresh)) returning id into result;
  return result;
end $$;
revoke all on function public.prepare_saved_search_digest(uuid,date,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_saved_search_digest(uuid,date,jsonb) to service_role;
