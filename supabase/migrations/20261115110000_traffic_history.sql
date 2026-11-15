-- Preserve anonymous daily aggregates before raw retention, without a new scheduler.
create table public.web_traffic_daily_history (
 day date primary key,
 report jsonb not null,
 saved_at timestamptz not null default now()
);
alter table public.web_traffic_daily_history enable row level security;
revoke all on public.web_traffic_daily_history from public,anon,authenticated;
grant all on public.web_traffic_daily_history to service_role;
create function public.web_traffic_range(p_start timestamptz,p_end timestamptz)
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
select jsonb_build_object('views',(select count(*) from visits),'visitorDays',(select count(*) from journeys),'contactVisitors',(select count(*) from converted),'contacts',(select count(*) from contacts),'since',(select min(created_at) from visits),'daily',coalesce((select jsonb_agg(daily) from daily),'[]'::jsonb),'sources',coalesce((select jsonb_agg(sources) from sources),'[]'::jsonb),'pages',coalesce((select jsonb_agg(pages) from pages),'[]'::jsonb));
$$;
revoke all on function public.web_traffic_range(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.web_traffic_range(timestamptz,timestamptz) to service_role;
create function public.archive_web_traffic_days() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare first_day date; last_day date; d date;
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Service role required'; end if;
 last_day := (now() at time zone 'UTC')::date - 1;
 if exists(select 1 from public.web_traffic_daily_history where day=last_day) then return; end if;
 perform pg_advisory_xact_lock(hashtextextended('aerotrade-traffic-history',0));
 select min(day) into first_day from (
  select (min(created_at) at time zone 'UTC')::date as day from public.web_traffic_events
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
revoke all on function public.archive_web_traffic_days() from public,anon,authenticated;
grant execute on function public.archive_web_traffic_days() to service_role;
create function public.web_traffic_history_report() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; today date := (now() at time zone 'UTC')::date;
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Service role required'; end if;
 perform public.archive_web_traffic_days();
 select coalesce(jsonb_agg(jsonb_build_object('day',day,'report',report) order by day),'[]'::jsonb)
 into result from public.web_traffic_daily_history;
 return result || jsonb_build_array(jsonb_build_object('day',today,'report',public.web_traffic_range(today::timestamp at time zone 'UTC',now())));
end; $$;
revoke all on function public.web_traffic_history_report() from public,anon,authenticated;
grant execute on function public.web_traffic_history_report() to service_role;
create or replace function public.record_web_traffic(p_event_id uuid,p_journey text,p_path text,p_source text,p_medium text,p_campaign text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Service role required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_journey,0));
  if (select count(*) from public.web_traffic_events where journey_key=p_journey) >= 200 then return; end if;
  insert into public.web_traffic_events(event_id,journey_key,path,source,medium,campaign)
    values(p_event_id,p_journey,p_path,p_source,p_medium,p_campaign) on conflict(event_id) do nothing;
  perform public.archive_web_traffic_days();
  delete from public.web_traffic_events where created_at < (date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') - interval '30 days';
end; $$;
revoke all on function public.record_web_traffic(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_web_traffic(uuid,text,text,text,text,text) to service_role;
-- Keep the existing report contract; do not truncate source totals before grouping.
create or replace function public.web_traffic_report() returns jsonb
language sql security definer set search_path=public,pg_temp as $$
 select public.web_traffic_range(now()-interval '30 days',now());
$$;
