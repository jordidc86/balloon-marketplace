create or replace function public.accept_new_balloon_proposal_delivery(p_proposal_id uuid, p_provider_message_id text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_service_role boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_quote_id uuid;
  v_status text;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if not v_service_role and (v_actor is null or not exists (
    select 1 from public.users where id = v_actor and role = 'admin'
  )) then
    raise exception 'Not authorized';
  end if;
  if p_provider_message_id is null or char_length(btrim(p_provider_message_id)) not between 3 and 200 then
    raise exception 'Invalid provider message id';
  end if;

  select quote_request_id, delivery_status
    into v_quote_id, v_status
    from public.new_balloon_quote_proposals
   where id = p_proposal_id
   for update;
  if not found then raise exception 'Proposal not found'; end if;
  if v_status = 'accepted' then return p_proposal_id; end if;

  update public.new_balloon_quote_proposals
     set delivery_status = 'accepted',
         provider_message_id = btrim(p_provider_message_id),
         delivery_error = null,
         accepted_at = v_now
   where id = p_proposal_id;

  update public.quote_requests
     set status = 'QUOTE_SENT', updated_at = v_now
   where id = v_quote_id
     and status not in ('WON', 'LOST');

  return p_proposal_id;
end;
$$;

revoke all on function public.accept_new_balloon_proposal_delivery(uuid,text) from public, anon;
grant execute on function public.accept_new_balloon_proposal_delivery(uuid,text) to authenticated, service_role;

comment on function public.accept_new_balloon_proposal_delivery(uuid,text) is
  'Atomically records provider-confirmed proposal delivery for an authenticated administrator or the service-role recovery cron. It advances an open quote but records delivery truth without reopening a quote that closed after the email was accepted.';
