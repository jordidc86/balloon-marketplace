import assert from 'node:assert/strict'

const adminId = '40000000-0000-4000-8000-000000000001'
const buyerId = '40000000-0000-4000-8000-000000000002'
const quoteId = '50000000-0000-4000-8000-000000000001'
const proposalId = '60000000-0000-4000-8000-000000000001'

const expectedResult = {
  quoteStatus: 'WON',
  proposalDeliveryStatus: 'accepted',
  proposalCount: 1,
  responseEvents: 1,
  responseType: 'INTERESTED',
  outcomeEvents: 1,
  unitEconomicsEvents: 1,
  grossAmountMinor: 6000000,
  aerotradeRevenueMinor: 300000,
  contributionMarginMinor: 182000,
  authorizationGate: 'passed',
  preDeliveryGate: 'passed',
  deliveryIdempotencyGate: 'passed',
  responseIdempotencyGate: 'passed',
  immutableResponseGate: 'passed',
  externalMessagesSent: 0,
}

export function rehearseNewBalloonTransaction(runSql) {
  const output = runSql(`
begin;

set local timezone = 'UTC';
set local session_replication_role = 'replica';
insert into public.users (id, email, role, name) values
  ('${adminId}', 'new-balloon-admin@example.invalid', 'admin', 'Synthetic administrator'),
  ('${buyerId}', 'new-balloon-buyer@example.invalid', 'user', 'Synthetic buyer');
set local session_replication_role = 'origin';

insert into public.quote_requests (
  id, name, email, country, manufacturer_preference, equipment_type,
  volume_or_capacity, intended_use, budget_range, timeline, status,
  source_context, requested_category, privacy_consent_at
) values (
  '${quoteId}', 'Synthetic new-balloon buyer', 'new-balloon-buyer@example.invalid',
  'DE', 'pasha', 'complete_balloon', '6000 m3', 'commercial passenger flights',
  'EUR 58,000-62,000', 'within 12 months', 'NEW', 'direct', 'complete',
  timezone('utc', now())
);

insert into public.new_balloon_quote_proposals (
  id, quote_request_id, proposal_fingerprint, manufacturer, currency,
  amount_min_minor, amount_max_minor, configuration_summary,
  delivery_guidance, valid_until, terms, recorded_by
) values (
  '${proposalId}', '${quoteId}', repeat('a', 64), 'pasha', 'EUR',
  5800000, 6200000,
  'Synthetic complete balloon proposal used only for disposable database verification.',
  'Indicative delivery within twelve months.', current_date + 30,
  'Indicative and non-binding until a separate manufacturer contract is signed.', '${adminId}'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do \$\$
begin
  begin
    perform * from public.record_new_balloon_proposal_response(
      '${proposalId}', 'new-balloon-buyer@example.invalid', 'INTERESTED',
      'Synthetic interest before delivery'
    );
    raise exception 'Pre-delivery response rehearsal unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'Proposal delivery is not accepted' then raise; end if;
  end;
end
\$\$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '${buyerId}', true);
select set_config('request.jwt.claims', '{"sub":"${buyerId}","role":"authenticated"}', true);
do \$\$
begin
  begin
    perform public.accept_new_balloon_proposal_delivery(
      '${proposalId}', 'synthetic-provider-message'
    );
    raise exception 'Proposal delivery authorization rehearsal unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'Not authorized' then raise; end if;
  end;
end
\$\$;

select set_config('request.jwt.claim.sub', '${adminId}', true);
select set_config('request.jwt.claims', '{"sub":"${adminId}","role":"authenticated"}', true);
do \$\$
declare
  v_first uuid;
  v_second uuid;
begin
  select public.accept_new_balloon_proposal_delivery(
    '${proposalId}', 'synthetic-provider-message'
  ) into v_first;
  select public.accept_new_balloon_proposal_delivery(
    '${proposalId}', 'synthetic-provider-message'
  ) into v_second;
  if v_first is null or v_first is distinct from v_second then
    raise exception 'Proposal delivery idempotency rehearsal failed';
  end if;
end
\$\$;
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do \$\$
declare
  v_first uuid;
  v_second uuid;
begin
  select event_id into v_first
  from public.record_new_balloon_proposal_response(
    '${proposalId}', 'new-balloon-buyer@example.invalid', 'INTERESTED',
    'Synthetic buyer requests operator follow-up'
  );
  select event_id into v_second
  from public.record_new_balloon_proposal_response(
    '${proposalId}', 'new-balloon-buyer@example.invalid', 'INTERESTED',
    'Synthetic buyer requests operator follow-up'
  );
  if v_first is null or v_first is distinct from v_second then
    raise exception 'Proposal response idempotency rehearsal failed';
  end if;

  begin
    perform * from public.record_new_balloon_proposal_response(
      '${proposalId}', 'new-balloon-buyer@example.invalid', 'DECLINED', null
    );
    raise exception 'Immutable proposal response rehearsal unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'A different response is already recorded' then raise; end if;
  end;
end
\$\$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '${adminId}', true);
select set_config('request.jwt.claims', '{"sub":"${adminId}","role":"authenticated"}', true);
do \$\$
declare
  v_outcome uuid;
  v_economics_event uuid;
begin
  select public.record_commercial_outcome(
    'quote_request', '${quoteId}', 'intermediation', 'EUR', 6000000, 300000,
    'settled', 'bank_transfer', 'synthetic-bank-transfer',
    'Synthetic new-balloon outcome; no real contract, payment or customer.'
  ) into v_outcome;
  select public.record_commercial_unit_economics(
    v_outcome, 50000, 8000, 60000, 'settled', 'bank_statement',
    'synthetic-bank-statement', 'Synthetic complete intermediation economics.'
  ) into v_economics_event;
  if v_outcome is null or v_economics_event is null then
    raise exception 'New-balloon commercial rehearsal did not return durable identifiers';
  end if;
end
\$\$;
reset role;

select json_build_object(
  'quoteStatus', (select status from public.quote_requests where id = '${quoteId}'),
  'proposalDeliveryStatus', (select delivery_status from public.new_balloon_quote_proposals where id = '${proposalId}'),
  'proposalCount', (select count(*) from public.new_balloon_quote_proposals where quote_request_id = '${quoteId}'),
  'responseEvents', (select count(*) from public.new_balloon_proposal_response_events where quote_request_id = '${quoteId}'),
  'responseType', (select response_type from public.new_balloon_proposal_response_events where quote_request_id = '${quoteId}'),
  'outcomeEvents', (select count(*) from public.commercial_outcome_events where entity_type = 'quote_request' and entity_id = '${quoteId}'),
  'unitEconomicsEvents', (select count(*) from public.commercial_unit_economics_events where outcome_id = (select id from public.commercial_outcomes where entity_type = 'quote_request' and entity_id = '${quoteId}')),
  'grossAmountMinor', (select gross_amount_minor from public.commercial_outcomes where entity_type = 'quote_request' and entity_id = '${quoteId}'),
  'aerotradeRevenueMinor', (select aerotrade_revenue_minor from public.commercial_outcomes where entity_type = 'quote_request' and entity_id = '${quoteId}'),
  'contributionMarginMinor', (select contribution_margin_minor from public.commercial_outcomes where entity_type = 'quote_request' and entity_id = '${quoteId}'),
  'authorizationGate', 'passed',
  'preDeliveryGate', 'passed',
  'deliveryIdempotencyGate', 'passed',
  'responseIdempotencyGate', 'passed',
  'immutableResponseGate', 'passed',
  'externalMessagesSent', 0
)::text;

rollback;
  `)
  const jsonLine = output.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)
  assert.ok(jsonLine, 'New-balloon rehearsal did not return a structured readback')
  const result = JSON.parse(jsonLine)
  assert.deepEqual(result, expectedResult)
  return result
}
