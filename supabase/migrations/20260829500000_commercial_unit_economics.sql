-- Unit economics extend the existing commercial outcome rather than creating a
-- second source of truth. Missing costs remain NULL and therefore never appear
-- as zero-margin or profitable activity. Every accepted measurement produces an
-- immutable evidence snapshot.

alter table public.commercial_outcomes
  add column if not exists direct_cost_minor bigint,
  add column if not exists payment_fee_minor bigint,
  add column if not exists tax_amount_minor bigint,
  add column if not exists contribution_margin_minor bigint generated always as (
    case
      when direct_cost_minor is not null
        and payment_fee_minor is not null
        and tax_amount_minor is not null
      then aerotrade_revenue_minor - direct_cost_minor - payment_fee_minor - tax_amount_minor
      else null
    end
  ) stored,
  add column if not exists economics_evidence_level text,
  add column if not exists economics_evidence_source text,
  add column if not exists economics_evidence_reference text,
  add column if not exists economics_notes text,
  add column if not exists economics_recorded_by uuid references public.users(id) on delete restrict,
  add column if not exists economics_recorded_at timestamp with time zone;

alter table public.commercial_outcomes
  drop constraint if exists commercial_outcomes_economics_costs_complete,
  drop constraint if exists commercial_outcomes_economics_amount_bounds,
  drop constraint if exists commercial_outcomes_economics_evidence_level_check,
  drop constraint if exists commercial_outcomes_economics_evidence_source_check,
  drop constraint if exists commercial_outcomes_economics_reference_length,
  drop constraint if exists commercial_outcomes_economics_notes_length,
  drop constraint if exists commercial_outcomes_economics_consistency;

alter table public.commercial_outcomes
  add constraint commercial_outcomes_economics_costs_complete check (
    (direct_cost_minor is null and payment_fee_minor is null and tax_amount_minor is null)
    or
    (direct_cost_minor is not null and payment_fee_minor is not null and tax_amount_minor is not null)
  ),
  add constraint commercial_outcomes_economics_amount_bounds check (
    direct_cost_minor is null
    or (
      direct_cost_minor between 0 and 99999999999
      and payment_fee_minor between 0 and 99999999999
      and tax_amount_minor between 0 and 99999999999
    )
  ),
  add constraint commercial_outcomes_economics_evidence_level_check
    check (economics_evidence_level is null or economics_evidence_level in ('reported', 'documented', 'settled')),
  add constraint commercial_outcomes_economics_evidence_source_check
    check (economics_evidence_source is null or economics_evidence_source in ('operator_report', 'invoice', 'stripe_balance_transaction', 'bank_statement', 'other_document')),
  add constraint commercial_outcomes_economics_reference_length
    check (economics_evidence_reference is null or char_length(economics_evidence_reference) between 3 and 200),
  add constraint commercial_outcomes_economics_notes_length
    check (economics_notes is null or char_length(economics_notes) <= 2000),
  add constraint commercial_outcomes_economics_consistency check (
    (
      direct_cost_minor is null
      and economics_evidence_level is null
      and economics_evidence_source is null
      and economics_evidence_reference is null
      and economics_notes is null
      and economics_recorded_by is null
      and economics_recorded_at is null
    )
    or
    (
      direct_cost_minor is not null
      and economics_recorded_by is not null
      and economics_recorded_at is not null
      and (
        (economics_evidence_level = 'reported' and economics_evidence_source = 'operator_report' and economics_evidence_reference is null)
        or
        (economics_evidence_level = 'documented' and economics_evidence_source in ('invoice', 'stripe_balance_transaction', 'bank_statement', 'other_document') and economics_evidence_reference is not null)
        or
        (economics_evidence_level = 'settled' and economics_evidence_source in ('stripe_balance_transaction', 'bank_statement') and economics_evidence_reference is not null)
      )
    )
  );

create index if not exists commercial_outcomes_economics_evidence_idx
  on public.commercial_outcomes (economics_evidence_level, economics_recorded_at desc)
  where direct_cost_minor is not null;

create table if not exists public.commercial_unit_economics_events (
  id uuid default uuid_generate_v4() primary key,
  outcome_id uuid not null references public.commercial_outcomes(id) on delete restrict,
  event_type text not null check (event_type in ('ECONOMICS_RECORDED', 'ECONOMICS_UPDATED')),
  currency text not null check (currency in ('EUR', 'GBP', 'USD')),
  aerotrade_revenue_minor bigint not null check (aerotrade_revenue_minor >= 0),
  direct_cost_minor bigint not null check (direct_cost_minor between 0 and 99999999999),
  payment_fee_minor bigint not null check (payment_fee_minor between 0 and 99999999999),
  tax_amount_minor bigint not null check (tax_amount_minor between 0 and 99999999999),
  contribution_margin_minor bigint not null,
  evidence_level text not null check (evidence_level in ('reported', 'documented', 'settled')),
  evidence_source text not null check (evidence_source in ('operator_report', 'invoice', 'stripe_balance_transaction', 'bank_statement', 'other_document')),
  evidence_reference text check (evidence_reference is null or char_length(evidence_reference) between 3 and 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  recorded_by uuid not null references public.users(id) on delete restrict,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint commercial_unit_economics_events_evidence_consistency check (
    (evidence_level = 'reported' and evidence_source = 'operator_report' and evidence_reference is null)
    or
    (evidence_level = 'documented' and evidence_source in ('invoice', 'stripe_balance_transaction', 'bank_statement', 'other_document') and evidence_reference is not null)
    or
    (evidence_level = 'settled' and evidence_source in ('stripe_balance_transaction', 'bank_statement') and evidence_reference is not null)
  )
);

create index if not exists commercial_unit_economics_events_outcome_created_idx
  on public.commercial_unit_economics_events (outcome_id, created_at desc);

alter table public.commercial_unit_economics_events enable row level security;
revoke all on public.commercial_unit_economics_events from anon, authenticated;
grant select on public.commercial_unit_economics_events to authenticated;

drop policy if exists "Admins can read commercial unit economics history" on public.commercial_unit_economics_events;
create policy "Admins can read commercial unit economics history"
  on public.commercial_unit_economics_events for select
  to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create or replace function public.prevent_untracked_economics_basis_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.direct_cost_minor is not null
    and (
      new.currency is distinct from old.currency
      or new.aerotrade_revenue_minor is distinct from old.aerotrade_revenue_minor
    ) then
    raise exception 'Revenue or currency cannot change after unit economics are recorded; confirm the outcome basis before recording economics';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_untracked_economics_basis_change on public.commercial_outcomes;
create trigger prevent_untracked_economics_basis_change
  before update of currency, aerotrade_revenue_minor on public.commercial_outcomes
  for each row execute procedure public.prevent_untracked_economics_basis_change();

create or replace function public.record_commercial_unit_economics(
  p_outcome_id uuid,
  p_direct_cost_minor bigint,
  p_payment_fee_minor bigint,
  p_tax_amount_minor bigint,
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
  v_outcome public.commercial_outcomes%rowtype;
  v_event_id uuid;
  v_event_type text;
  v_reference text := nullif(btrim(p_evidence_reference), '');
  v_notes text := nullif(btrim(p_notes), '');
  v_now timestamp with time zone := timezone('utc'::text, now());
begin
  if v_actor is null or not exists (
    select 1 from public.users where id = v_actor and role = 'admin'
  ) then
    raise exception 'Not authorized';
  end if;

  if p_direct_cost_minor is null or p_payment_fee_minor is null or p_tax_amount_minor is null
    or p_direct_cost_minor not between 0 and 99999999999
    or p_payment_fee_minor not between 0 and 99999999999
    or p_tax_amount_minor not between 0 and 99999999999 then
    raise exception 'Invalid unit economics amounts';
  end if;
  if p_evidence_level not in ('reported', 'documented', 'settled') then raise exception 'Invalid economics evidence level'; end if;
  if p_evidence_source not in ('operator_report', 'invoice', 'stripe_balance_transaction', 'bank_statement', 'other_document') then
    raise exception 'Invalid economics evidence source';
  end if;
  if v_reference is not null and char_length(v_reference) not between 3 and 200 then raise exception 'Invalid economics evidence reference'; end if;
  if v_notes is not null and char_length(v_notes) > 2000 then raise exception 'Economics notes are too long'; end if;
  if p_evidence_level = 'reported' and (p_evidence_source <> 'operator_report' or v_reference is not null) then
    raise exception 'Reported economics must use an operator report without a document reference';
  end if;
  if p_evidence_level = 'documented' and (p_evidence_source = 'operator_report' or v_reference is null) then
    raise exception 'Documented economics require a document source and reference';
  end if;
  if p_evidence_level = 'settled' and (p_evidence_source not in ('stripe_balance_transaction', 'bank_statement') or v_reference is null) then
    raise exception 'Settled economics require a bank statement or Stripe balance-transaction reference';
  end if;

  select * into v_outcome
  from public.commercial_outcomes
  where id = p_outcome_id
  for update;
  if not found then raise exception 'Commercial outcome not found'; end if;

  if v_outcome.economics_evidence_level is not null and
    array_position(array['reported', 'documented', 'settled'], p_evidence_level)
      < array_position(array['reported', 'documented', 'settled'], v_outcome.economics_evidence_level) then
    raise exception 'Unit economics evidence cannot be downgraded';
  end if;

  v_event_type := case when v_outcome.direct_cost_minor is null then 'ECONOMICS_RECORDED' else 'ECONOMICS_UPDATED' end;

  update public.commercial_outcomes set
    direct_cost_minor = p_direct_cost_minor,
    payment_fee_minor = p_payment_fee_minor,
    tax_amount_minor = p_tax_amount_minor,
    economics_evidence_level = p_evidence_level,
    economics_evidence_source = p_evidence_source,
    economics_evidence_reference = v_reference,
    economics_notes = v_notes,
    economics_recorded_by = v_actor,
    economics_recorded_at = v_now
  where id = p_outcome_id;

  insert into public.commercial_unit_economics_events (
    outcome_id, event_type, currency, aerotrade_revenue_minor,
    direct_cost_minor, payment_fee_minor, tax_amount_minor,
    contribution_margin_minor, evidence_level, evidence_source,
    evidence_reference, notes, recorded_by
  ) values (
    p_outcome_id, v_event_type, v_outcome.currency, v_outcome.aerotrade_revenue_minor,
    p_direct_cost_minor, p_payment_fee_minor, p_tax_amount_minor,
    v_outcome.aerotrade_revenue_minor - p_direct_cost_minor - p_payment_fee_minor - p_tax_amount_minor,
    p_evidence_level, p_evidence_source, v_reference, v_notes, v_actor
  ) returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.record_commercial_unit_economics(uuid, bigint, bigint, bigint, text, text, text, text) from public, anon;
grant execute on function public.record_commercial_unit_economics(uuid, bigint, bigint, bigint, text, text, text, text) to authenticated;

comment on function public.record_commercial_unit_economics(uuid, bigint, bigint, bigint, text, text, text, text) is
  'Atomically records complete unit economics and an immutable evidence snapshot for an existing commercial outcome.';

comment on column public.commercial_outcomes.contribution_margin_minor is
  'Evidence-backed AeroTrade contribution. NULL means costs have not been completely measured; negative values are valid.';
