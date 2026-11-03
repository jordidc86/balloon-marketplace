-- Public external-ad metadata only. Isolated from listings, users and messaging.
create table public.external_catalog_sources (
  source_id text primary key check (source_id in ('balloons4sale','zebedee','secondhand','swapballoon','barnstormers')),
  snapshot jsonb not null default '{"pages":[]}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  last_attempt_at timestamptz,
  last_completed_at timestamptz,
  last_run_key text,
  lease_token uuid,
  lease_until timestamptz
);
alter table public.external_catalog_sources enable row level security;
revoke all on public.external_catalog_sources from public, anon, authenticated;
grant select, insert, update on public.external_catalog_sources to service_role;

create function public.claim_external_catalog_refresh(p_source text, p_run_key text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare token uuid;
begin
  if p_run_key is null or p_run_key <> to_char(now() at time zone 'UTC', 'YYYY-MM-DD') then
    raise exception 'Invalid refresh date';
  end if;
  insert into public.external_catalog_sources(source_id) values (p_source)
    on conflict (source_id) do nothing;
  update public.external_catalog_sources
    set lease_token = gen_random_uuid(), lease_until = now() + interval '10 minutes', last_attempt_at = now()
    where source_id = p_source
      and (lease_until is null or lease_until < now())
      and last_run_key is distinct from p_run_key
    returning lease_token into token;
  return token;
end;
$$;
revoke all on function public.claim_external_catalog_refresh(text,text) from public, anon, authenticated;
grant execute on function public.claim_external_catalog_refresh(text,text) to service_role;
