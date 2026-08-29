-- A marketplace outcome and the corresponding opportunity status must never
-- diverge. Revenue evidence is classified explicitly so an operator report is
-- not accidentally counted as settled AeroTrade revenue.

alter table public.commercial_outcomes
  add column if not exists evidence_source text not null default 'operator_report',
  add column if not exists evidence_reference text,
  add column if not exists settled_at timestamp with time zone;

alter table public.commercial_outcomes
  drop constraint if exists commercial_outcomes_evidence_source_check,
  drop constraint if exists commercial_outcomes_evidence_reference_length,
  drop constraint if exists commercial_outcomes_evidence_consistency,
  drop constraint if exists commercial_outcomes_settlement_consistency;

alter table public.commercial_outcomes
  add constraint commercial_outcomes_evidence_source_check
    check (evidence_source in ('operator_report', 'contract', 'invoice', 'bank_transfer', 'stripe_payment', 'other_document')),
  add constraint commercial_outcomes_evidence_reference_length
    check (evidence_reference is null or char_length(evidence_reference) between 3 and 200),
  add constraint commercial_outcomes_evidence_consistency
    check (
      (evidence_level = 'reported' and evidence_source = 'operator_report')
      or
      (evidence_level = 'documented' and evidence_source in ('contract', 'invoice', 'bank_transfer', 'stripe_payment', 'other_document') and evidence_reference is not null)
      or
      (evidence_level = 'settled' and evidence_source in ('bank_transfer', 'stripe_payment') and evidence_reference is not null)
    ),
  add constraint commercial_outcomes_settlement_consistency
    check ((evidence_level = 'settled') = (settled_at is not null));

create table if not exists public.commercial_outcome_events (
  id uuid default uuid_generate_v4() primary key,
  outcome_id uuid not null references public.commercial_outcomes(id) on delete restrict,
  entity_type text not null check (entity_type in ('marketplace_inquiry', 'quote_request')),
  entity_id uuid not null,
  event_type text not null check (event_type in ('OUTCOME_RECORDED', 'OUTCOME_UPDATED')),
  outcome_type text not null check (outcome_type in ('sale', 'intermediation', 'other')),
  currency text not null check (currency in ('EUR', 'GBP', 'USD')),
  gross_amount_minor bigint not null check (gross_amount_minor >= 0),
  aerotrade_revenue_minor bigint not null check (aerotrade_revenue_minor >= 0 and aerotrade_revenue_minor <= gross_amount_minor),
  evidence_level text not null check (evidence_level in ('reported', 'documented', 'settled')),
  evidence_source text not null check (evidence_source in ('operator_report', 'contract', 'invoice', 'bank_transfer', 'stripe_payment', 'other_document')),
  evidence_reference text check (evidence_reference is null or char_length(evidence_reference) between 3 and 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  recorded_by uuid not null references public.users(id) on delete restrict,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists commercial_outcome_events_outcome_created_idx
  on public.commercial_outcome_events (outcome_id, created_at desc);

alter table public.commercial_outcome_events enable row level security;
revoke all on public.commercial_outcome_events from anon, authenticated;
grant select on public.commercial_outcome_events to authenticated;

drop policy if exists "Admins can read commercial outcome history" on public.commercial_outcome_events;
create policy "Admins can read commercial outcome history"
  on public.commercial_outcome_events for select
  to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create or replace function public.enforce_commercial_outcome_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entity_type text := case when tg_table_name = 'marketplace_inquiries' then 'marketplace_inquiry' else 'quote_request' end;
  v_has_outcome boolean;
begin
  if new.status is not distinct from old.status then return new; end if;

  select exists (
    select 1 from public.commercial_outcomes
    where entity_type = v_entity_type and entity_id = new.id
  ) into v_has_outcome;

  if new.status = 'WON' and not v_has_outcome then
    raise exception 'WON status requires an atomic commercial outcome';
  end if;
  if new.status <> 'WON' and v_has_outcome then
    raise exception 'An opportunity with a commercial outcome must remain WON';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_marketplace_inquiry_outcome_status on public.marketplace_inquiries;
create trigger enforce_marketplace_inquiry_outcome_status
  before update of status on public.marketplace_inquiries
  for each row execute procedure public.enforce_commercial_outcome_status();

drop trigger if exists enforce_quote_request_outcome_status on public.quote_requests;
create trigger enforce_quote_request_outcome_status
  before update of status on public.quote_requests
  for each row execute procedure public.enforce_commercial_outcome_status();

create or replace function public.record_commercial_outcome(
  p_entity_type text,
  p_entity_id uuid,
  p_outcome_type text,
  p_currency text,
  p_gross_amount_minor bigint,
  p_aerotrade_revenue_minor bigint,
  p_evidence_level text,
  p_evidence_source text,
  p_evidence_reference text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_current_status text;
  v_outcome_id uuid;
  v_event_type text;
  v_previous_evidence_level text;
  v_now timestamp with time zone := timezone('utc'::text, now());
  v_reference text := nullif(btrim(p_evidence_reference), '');
  v_notes text := nullif(btrim(p_notes), '');
begin
  if v_actor is null or not exists (
    select 1 from public.users where id = v_actor and role = 'admin'
  ) then
    raise exception 'Not authorized';
  end if;

  if p_entity_type not in ('marketplace_inquiry', 'quote_request') then raise exception 'Invalid entity type'; end if;
  if p_outcome_type not in ('sale', 'intermediation', 'other') then raise exception 'Invalid outcome type'; end if;
  if p_currency not in ('EUR', 'GBP', 'USD') then raise exception 'Invalid currency'; end if;
  if p_gross_amount_minor < 0 or p_aerotrade_revenue_minor < 0 or p_aerotrade_revenue_minor > p_gross_amount_minor then
    raise exception 'Invalid outcome amounts';
  end if;
  if p_outcome_type in ('sale', 'intermediation') and p_gross_amount_minor = 0 then
    raise exception 'A sale or intermediation outcome requires a positive gross amount';
  end if;
  if p_evidence_level not in ('reported', 'documented', 'settled') then raise exception 'Invalid evidence level'; end if;
  if p_evidence_source not in ('operator_report', 'contract', 'invoice', 'bank_transfer', 'stripe_payment', 'other_document') then
    raise exception 'Invalid evidence source';
  end if;
  if v_reference is not null and char_length(v_reference) not between 3 and 200 then raise exception 'Invalid evidence reference'; end if;
  if v_notes is not null and char_length(v_notes) > 2000 then raise exception 'Outcome notes are too long'; end if;
  if p_evidence_level = 'reported' and p_evidence_source <> 'operator_report' then
    raise exception 'Reported outcomes must use operator report evidence';
  end if;
  if p_evidence_level = 'documented' and (p_evidence_source = 'operator_report' or v_reference is null) then
    raise exception 'Documented outcomes require a document source and reference';
  end if;
  if p_evidence_level = 'settled' and (p_evidence_source not in ('bank_transfer', 'stripe_payment') or v_reference is null) then
    raise exception 'Settled revenue requires a bank or Stripe reference';
  end if;

  if p_entity_type = 'marketplace_inquiry' then
    select status into v_current_status
    from public.marketplace_inquiries
    where id = p_entity_id
    for update;
    if not found then raise exception 'Commercial opportunity not found'; end if;
    if v_current_status in ('LOST', 'SPAM') then raise exception 'A closed unsuccessful enquiry cannot be recorded as won'; end if;
  else
    select status into v_current_status
    from public.quote_requests
    where id = p_entity_id
    for update;
    if not found then raise exception 'Commercial opportunity not found'; end if;
    if v_current_status = 'LOST' then raise exception 'A lost quote cannot be recorded as won'; end if;
  end if;

  select id, evidence_level into v_outcome_id, v_previous_evidence_level
  from public.commercial_outcomes
  where entity_type = p_entity_type and entity_id = p_entity_id;
  v_event_type := case when v_outcome_id is null then 'OUTCOME_RECORDED' else 'OUTCOME_UPDATED' end;
  if v_previous_evidence_level is not null and
    array_position(array['reported', 'documented', 'settled'], p_evidence_level)
      < array_position(array['reported', 'documented', 'settled'], v_previous_evidence_level) then
    raise exception 'Outcome evidence cannot be downgraded';
  end if;

  insert into public.commercial_outcomes (
    entity_type, entity_id, outcome_type, currency, gross_amount_minor,
    aerotrade_revenue_minor, evidence_level, evidence_source,
    evidence_reference, notes, recorded_by, closed_at, settled_at
  ) values (
    p_entity_type, p_entity_id, p_outcome_type, p_currency, p_gross_amount_minor,
    p_aerotrade_revenue_minor, p_evidence_level, p_evidence_source,
    v_reference, v_notes, v_actor, v_now,
    case when p_evidence_level = 'settled' then v_now else null end
  )
  on conflict (entity_type, entity_id) do update set
    outcome_type = excluded.outcome_type,
    currency = excluded.currency,
    gross_amount_minor = excluded.gross_amount_minor,
    aerotrade_revenue_minor = excluded.aerotrade_revenue_minor,
    evidence_level = excluded.evidence_level,
    evidence_source = excluded.evidence_source,
    evidence_reference = excluded.evidence_reference,
    notes = excluded.notes,
    recorded_by = excluded.recorded_by,
    closed_at = public.commercial_outcomes.closed_at,
    settled_at = case
      when excluded.evidence_level = 'settled' then coalesce(public.commercial_outcomes.settled_at, excluded.settled_at)
      else null
    end
  returning id into v_outcome_id;

  insert into public.commercial_outcome_events (
    outcome_id, entity_type, entity_id, event_type, outcome_type, currency,
    gross_amount_minor, aerotrade_revenue_minor, evidence_level,
    evidence_source, evidence_reference, notes, recorded_by
  ) values (
    v_outcome_id, p_entity_type, p_entity_id, v_event_type, p_outcome_type, p_currency,
    p_gross_amount_minor, p_aerotrade_revenue_minor, p_evidence_level,
    p_evidence_source, v_reference, v_notes, v_actor
  );

  if p_entity_type = 'marketplace_inquiry' then
    update public.marketplace_inquiries
    set status = 'WON', last_activity_at = v_now, closed_at = v_now
    where id = p_entity_id;
  else
    update public.quote_requests
    set status = 'WON', updated_at = v_now
    where id = p_entity_id;
  end if;

  return v_outcome_id;
end;
$$;

revoke all on function public.record_commercial_outcome(text, uuid, text, text, bigint, bigint, text, text, text, text) from public, anon;
grant execute on function public.record_commercial_outcome(text, uuid, text, text, bigint, bigint, text, text, text, text) to authenticated;

comment on function public.record_commercial_outcome(text, uuid, text, text, bigint, bigint, text, text, text, text) is
  'Atomically records an admin-authorized commercial outcome, immutable evidence snapshot and WON opportunity status.';
