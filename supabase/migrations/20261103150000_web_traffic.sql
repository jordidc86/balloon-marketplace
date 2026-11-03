-- Additive, private first-party measurement. No IP, email, raw referrer or URL query.
create table public.web_traffic_events (
  event_id uuid primary key,
  journey_key text not null check (journey_key ~ '^[0-9a-f]{64}$'),
  path text not null check (length(path) <= 160),
  source text not null check (length(source) <= 255),
  medium text not null default '' check (length(medium) <= 120),
  campaign text not null default '' check (length(campaign) <= 120),
  created_at timestamptz not null default now()
);
alter table public.web_traffic_events enable row level security;
revoke all on public.web_traffic_events from anon, authenticated;
grant all on public.web_traffic_events to service_role;
create index web_traffic_created_idx on public.web_traffic_events(created_at);
create index web_traffic_journey_idx on public.web_traffic_events(journey_key,created_at);
create function public.record_web_traffic(p_event_id uuid,p_journey text,p_path text,p_source text,p_medium text,p_campaign text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Service role required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_journey,0));
  if (select count(*) from public.web_traffic_events where journey_key=p_journey) >= 200 then return; end if;
  insert into public.web_traffic_events(event_id,journey_key,path,source,medium,campaign)
    values(p_event_id,p_journey,p_path,p_source,p_medium,p_campaign) on conflict(event_id) do nothing;
  delete from public.web_traffic_events where created_at < now()-interval '30 days';
end; $$;
revoke all on function public.record_web_traffic(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_web_traffic(uuid,text,text,text,text,text) to service_role;
create function public.web_traffic_report() returns jsonb language sql security definer set search_path=public,pg_temp as $$
with visits as (
 select * from public.web_traffic_events where created_at>=now()-interval '30 days'
 and coalesce(auth.jwt()->>'role','')='service_role'
), journeys as (
 select distinct on(journey_key) journey_key,source,campaign,created_at from visits order by journey_key,created_at,event_id
), contacts as (
 select 'listing:'||id as id,journey_key,created_at from public.marketplace_inquiries where created_at>=now()-interval '30 days'
 union all select 'quote:'||id,journey_key,created_at from public.quote_requests where created_at>=now()-interval '30 days'
 union all select 'wanted:'||id,journey_key,created_at from public.wanted_requests where created_at>=now()-interval '30 days'
), converted as (
 select distinct j.journey_key from journeys j join contacts c on c.journey_key=j.journey_key and c.created_at>=j.created_at
), daily as (
 select (created_at at time zone 'UTC')::date as day,count(*) as views,count(distinct journey_key) as visitors from visits group by 1 order by 1 desc
), sources as (
 select j.source,j.campaign,count(*) as visitors,count(c.journey_key) as contacts from journeys j left join converted c using(journey_key) group by 1,2 order by count(*) desc limit 30
), pages as (select path,count(*) as views from visits group by path order by count(*) desc limit 20)
select jsonb_build_object('views',(select count(*) from visits),'visitorDays',(select count(*) from journeys),'contactVisitors',(select count(*) from converted),'contacts',(select count(*) from contacts),'since',(select min(created_at) from visits),'daily',coalesce((select jsonb_agg(daily) from daily),'[]'::jsonb),'sources',coalesce((select jsonb_agg(sources) from sources),'[]'::jsonb),'pages',coalesce((select jsonb_agg(pages) from pages),'[]'::jsonb));
$$;
revoke all on function public.web_traffic_report() from public,anon,authenticated;
grant execute on function public.web_traffic_report() to service_role;
