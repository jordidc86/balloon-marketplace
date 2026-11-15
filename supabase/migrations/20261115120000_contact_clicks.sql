-- Private intent measurement; a click is not a sent message or completed call.
create table public.web_contact_clicks (
 journey_key text not null check(journey_key ~ '^[0-9a-f]{64}$'),
 listing_id uuid not null,
 channel text not null check(channel in ('email','phone','whatsapp')),
 source text not null check(length(source)<=255),
 campaign text not null default '' check(length(campaign)<=120),
 created_at timestamptz not null default now(),
 primary key(journey_key,listing_id,channel)
);
alter table public.web_contact_clicks enable row level security;
revoke all on public.web_contact_clicks from public,anon,authenticated;
grant all on public.web_contact_clicks to service_role;
create index web_contact_clicks_date_idx on public.web_contact_clicks(created_at);
create table public.web_contact_measurement_start (id boolean primary key default true check(id),started_at timestamptz not null default now());
alter table public.web_contact_measurement_start enable row level security;
revoke all on public.web_contact_measurement_start from public,anon,authenticated;
grant all on public.web_contact_measurement_start to service_role;
insert into public.web_contact_measurement_start(id) values(true);
create function public.web_contact_click_report(p_start timestamptz,p_end timestamptz) returns jsonb
language sql security definer set search_path=public,pg_temp as $$
with clicks as (
 select * from public.web_contact_clicks where created_at>=p_start and created_at<p_end and coalesce(auth.jwt()->>'role','')='service_role'
), first_visits as (
 select distinct on(journey_key) journey_key,source,campaign,created_at from public.web_traffic_events where created_at>=p_start and created_at<p_end order by journey_key,created_at,event_id
), attributed as (
 select c.*,v.source as visit_source,v.campaign as visit_campaign from clicks c left join first_visits v on v.journey_key=c.journey_key and v.created_at<=c.created_at
), channels as (
 select channel,count(*) clicks,count(distinct journey_key) visitors from clicks group by channel
), sources as (
 select coalesce(visit_source,'unattributed') source,coalesce(visit_campaign,'') campaign,count(*) clicks,count(distinct journey_key) visitors from attributed group by 1,2
)
select jsonb_build_object('startedAt',(select started_at from public.web_contact_measurement_start),'clicks',(select count(*) from clicks),'visitors',(select count(distinct journey_key) from clicks),'channels',coalesce((select jsonb_agg(channels) from channels),'[]'::jsonb),'sources',coalesce((select jsonb_agg(sources) from sources),'[]'::jsonb));
$$;
revoke all on function public.web_contact_click_report(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.web_contact_click_report(timestamptz,timestamptz) to service_role;
create or replace function public.web_traffic_range(p_start timestamptz,p_end timestamptz)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
with visits as (
 select * from public.web_traffic_events where created_at >= p_start and created_at < p_end
 and coalesce(auth.jwt()->>'role','')='service_role'
), journeys as (
 select distinct on(journey_key) journey_key,source,campaign,created_at from visits order by journey_key,created_at,event_id
), contacts as (
 select 'listing:'||id as id,journey_key,created_at from public.marketplace_inquiries where created_at >= p_start and created_at < p_end
 union all select 'quote:'||id,journey_key,created_at from public.quote_requests where created_at >= p_start and created_at < p_end
 union all select 'wanted:'||id,journey_key,created_at from public.wanted_requests where created_at >= p_start and created_at < p_end
), converted as (
 select distinct j.journey_key from journeys j join contacts c on c.journey_key=j.journey_key and c.created_at>=j.created_at
), daily as (
 select (created_at at time zone 'UTC')::date as day,count(*) as views,count(distinct journey_key) as visitors from visits group by 1 order by 1 desc
), sources as (
 select j.source,j.campaign,count(*) as visitors,count(c.journey_key) as contacts from journeys j left join converted c using(journey_key) group by 1,2 order by count(*) desc
), pages as (select path,count(*) as views from visits group by path order by count(*) desc)
select jsonb_build_object('views',(select count(*) from visits),'visitorDays',(select count(*) from journeys),'contactVisitors',(select count(*) from converted),'contacts',(select count(*) from contacts),'since',(select min(created_at) from visits),'daily',coalesce((select jsonb_agg(daily) from daily),'[]'::jsonb),'sources',coalesce((select jsonb_agg(sources) from sources),'[]'::jsonb),'pages',coalesce((select jsonb_agg(pages) from pages),'[]'::jsonb),'contactClicks',public.web_contact_click_report(p_start,p_end));
$$;
create or replace function public.archive_web_traffic_days() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare first_day date; last_day date; d date;
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Service role required'; end if;
 last_day := (now() at time zone 'UTC')::date - 1;
 if exists(select 1 from public.web_traffic_daily_history where day=last_day) then return; end if;
 perform pg_advisory_xact_lock(hashtextextended('aerotrade-traffic-history',0));
 select min(day) into first_day from (
  select (min(created_at) at time zone 'UTC')::date as day from public.web_traffic_events
  union all select (min(created_at) at time zone 'UTC')::date from public.web_contact_clicks
  union all select max(day)+1 from public.web_traffic_daily_history
 ) dates;
 if first_day is null then return; end if;
 for d in select generate_series(first_day::timestamp,last_day::timestamp,interval '1 day')::date loop
  if not exists(select 1 from public.web_traffic_daily_history where day=d) then
   insert into public.web_traffic_daily_history(day,report)
   values(d,public.web_traffic_range(d::timestamp at time zone 'UTC',(d+1)::timestamp at time zone 'UTC'))
   on conflict(day) do nothing;
  end if;
 end loop;
end; $$;
create function public.record_contact_click(p_journey text,p_listing uuid,p_channel text,p_source text,p_campaign text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Service role required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_journey,0));
 if (select count(*) from public.web_contact_clicks where journey_key=p_journey)>=100 then return; end if;
 insert into public.web_contact_clicks(journey_key,listing_id,channel,source,campaign) values(p_journey,p_listing,p_channel,p_source,p_campaign) on conflict do nothing;
 perform public.archive_web_traffic_days();
 delete from public.web_contact_clicks where created_at < (date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')-interval '30 days';
end; $$;
revoke all on function public.record_contact_click(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.record_contact_click(text,uuid,text,text,text) to service_role;
