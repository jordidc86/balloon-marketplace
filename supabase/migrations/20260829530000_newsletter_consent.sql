alter table public.users
  add column newsletter_consent_status text not null default 'NOT_REQUESTED',
  add column newsletter_consented_at timestamp with time zone,
  add column newsletter_unsubscribed_at timestamp with time zone;

alter table public.users
  add constraint users_newsletter_consent_status_check
    check (newsletter_consent_status in ('NOT_REQUESTED', 'ACTIVE', 'UNSUBSCRIBED')),
  add constraint users_newsletter_consent_state_check
    check (
      (newsletter_consent_status = 'NOT_REQUESTED' and newsletter_consented_at is null and newsletter_unsubscribed_at is null)
      or (newsletter_consent_status = 'ACTIVE' and newsletter_consented_at is not null and newsletter_unsubscribed_at is null)
      or (newsletter_consent_status = 'UNSUBSCRIBED' and newsletter_unsubscribed_at is not null)
    );

create index users_newsletter_active_idx
  on public.users (newsletter_consent_status, id)
  where newsletter_consent_status = 'ACTIVE';

create or replace function public.set_own_newsletter_consent(p_enabled boolean)
returns table(newsletter_consent_status text, newsletter_consented_at timestamp with time zone, newsletter_unsubscribed_at timestamp with time zone)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamp with time zone := now();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_enabled is null then raise exception 'Preference is required'; end if;

  update public.users as u
  set
    newsletter_consent_status = case when p_enabled then 'ACTIVE' else 'UNSUBSCRIBED' end,
    newsletter_consented_at = case
      when p_enabled then v_now
      else u.newsletter_consented_at
    end,
    newsletter_unsubscribed_at = case when p_enabled then null else v_now end
  where id = v_user_id;

  if not found then raise exception 'User profile not found'; end if;

  return query
  select u.newsletter_consent_status, u.newsletter_consented_at, u.newsletter_unsubscribed_at
  from public.users u
  where u.id = v_user_id;
end;
$$;

revoke all on function public.set_own_newsletter_consent(boolean) from public, anon;
grant execute on function public.set_own_newsletter_consent(boolean) to authenticated;

comment on column public.users.newsletter_consent_status is
  'Explicit marketing-newsletter preference. Existing accounts remain NOT_REQUESTED; registration alone never creates consent.';
comment on function public.set_own_newsletter_consent(boolean) is
  'Authenticated owner-only preference transition. It cannot change Premium, listings, enquiries, payments or commercial outcomes.';
