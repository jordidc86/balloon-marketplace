import assert from 'node:assert/strict'

const sellerId = '10000000-0000-4000-8000-000000000001'
const adminId = '10000000-0000-4000-8000-000000000002'
const buyerId = '10000000-0000-4000-8000-000000000003'
const listingId = '20000000-0000-4000-8000-000000000001'
const inquiryId = '30000000-0000-4000-8000-000000000001'

const expectedResult = {
  listingStatus: 'SOLD',
  inquiryStatus: 'WON',
  offerEvents: 3,
  sellerCounterEvents: 1,
  buyerResponseEvents: 1,
  lifecycleEvents: 1,
  saleChannel: 'AEROTRADE',
  outcomeEvents: 1,
  unitEconomicsEvents: 1,
  grossAmountMinor: 4800000,
  aerotradeRevenueMinor: 240000,
  contributionMarginMinor: 161000,
  legacySellerFunnelEvents: 8,
  legacySellerFunnelChannelsNull: 8,
  authorizationGate: 'passed',
  idempotencyGate: 'passed',
  evidenceDowngradeGate: 'passed',
  economicsBasisGate: 'passed',
  externalMessagesSent: 0,
}

export function rehearseMarketplaceTransaction(runSql) {
  const output = runSql(`
begin;

set local timezone = 'UTC';
set local session_replication_role = 'replica';
insert into public.users (id, email, role, name) values
  ('${sellerId}', 'seller@example.invalid', 'user', 'Synthetic seller'),
  ('${adminId}', 'admin@example.invalid', 'admin', 'Synthetic administrator'),
  ('${buyerId}', 'buyer@example.invalid', 'user', 'Synthetic buyer');
set local session_replication_role = 'origin';

insert into public.listings (
  id, seller_id, category, title, description, price, currency, condition,
  location_country, contact_email, status, public_at
) values (
  '${listingId}', '${sellerId}', 'complete_balloon', 'Synthetic transaction rehearsal',
  'Disposable database-only listing used to verify the marketplace transaction boundary.',
  50000, 'EUR', 'used', 'DE', 'seller@example.invalid', 'ACTIVE_PUBLIC', timezone('utc', now())
);

-- Rehearse every seller-funnel stage used by the application currently in
-- production against the candidate schema. The new distribution channel must
-- remain null when the old application does not send it.
insert into public.seller_funnel_events (
  event_key, seller_id, listing_id, stage, listing_plan, source, entry_context
) values
  ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1', '${sellerId}', null, 'SELL_PAGE_VIEWED', null, 'web', 'direct'),
  ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2', '${sellerId}', null, 'FORM_STARTED', null, 'web', 'direct'),
  ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa3', '${sellerId}', '${listingId}', 'LISTING_SUBMITTED', 'free', 'web', 'direct'),
  ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa4', '${sellerId}', '${listingId}', 'CHECKOUT_CREATED', 'premium', 'stripe', 'direct'),
  ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa5', '${sellerId}', '${listingId}', 'CHECKOUT_RECOVERY_SENT', 'premium', 'recovery', 'system'),
  ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa6', '${sellerId}', '${listingId}', 'CHECKOUT_RESUMED', 'premium', 'web', 'dashboard'),
  ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa7', '${sellerId}', '${listingId}', 'PAYMENT_CONFIRMED', 'premium', 'stripe', 'system'),
  ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa8', '${sellerId}', '${listingId}', 'LISTING_PUBLISHED', 'free', 'web', 'dashboard');

insert into public.marketplace_inquiries (
  id, listing_id, buyer_user_id, buyer_name, buyer_email, message, source,
  status, seller_notification_status, currency, initial_offer_amount_minor
) values (
  '${inquiryId}', '${listingId}', '${buyerId}', 'Synthetic buyer', 'buyer@example.invalid',
  'Synthetic enquiry used only for the disposable end-to-end transaction rehearsal.',
  'listing_form', 'NEW', 'not_required', 'EUR', 4500000
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '${buyerId}', true);
select set_config('request.jwt.claims', '{"sub":"${buyerId}","role":"authenticated"}', true);
do \$\$
begin
  begin
    perform * from public.close_listing_by_actor(
      '${listingId}', 'SOLD', 'AEROTRADE', '${inquiryId}', 4800000, 'EUR'
    );
    raise exception 'Authorization rehearsal unexpectedly permitted buyer closure';
  exception when others then
    if sqlerrm <> 'Listing not found' then raise; end if;
  end;
end
\$\$;

select set_config('request.jwt.claim.sub', '${sellerId}', true);
select set_config('request.jwt.claims', '{"sub":"${sellerId}","role":"authenticated"}', true);
do \$\$
declare
  v_first uuid;
  v_second uuid;
begin
  select event_id into v_first
  from public.record_seller_inquiry_response(
    '${inquiryId}', 'COUNTER', 4800000, 'Synthetic counteroffer'
  );
  select event_id into v_second
  from public.record_seller_inquiry_response(
    '${inquiryId}', 'COUNTER', 4800000, 'Synthetic counteroffer'
  );
  if v_first is null or v_first is distinct from v_second then
    raise exception 'Seller response idempotency rehearsal failed';
  end if;
end
\$\$;
reset role;

set local role service_role;
do \$\$
declare
  v_seller_event uuid;
  v_first uuid;
  v_second uuid;
begin
  select id into v_seller_event
  from public.marketplace_inquiry_offer_events
  where inquiry_id = '${inquiryId}' and event_type = 'SELLER_COUNTERED';
  select event_id into v_first
  from public.record_buyer_inquiry_response(
    '${inquiryId}', v_seller_event, 'buyer@example.invalid', 'ACCEPT', null,
    'Synthetic buyer acceptance for continued negotiation'
  );
  select event_id into v_second
  from public.record_buyer_inquiry_response(
    '${inquiryId}', v_seller_event, 'buyer@example.invalid', 'ACCEPT', null,
    'Synthetic buyer acceptance for continued negotiation'
  );
  if v_first is null or v_first is distinct from v_second then
    raise exception 'Buyer response idempotency rehearsal failed';
  end if;
end
\$\$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '${sellerId}', true);
select set_config('request.jwt.claims', '{"sub":"${sellerId}","role":"authenticated"}', true);
do \$\$
declare
  v_first uuid;
  v_second uuid;
begin
  select event_id into v_first
  from public.close_listing_by_actor(
    '${listingId}', 'SOLD', 'AEROTRADE', '${inquiryId}', 4800000, 'EUR'
  );
  select event_id into v_second
  from public.close_listing_by_actor(
    '${listingId}', 'SOLD', 'AEROTRADE', '${inquiryId}', 4800000, 'EUR'
  );
  if v_first is null or v_first is distinct from v_second then
    raise exception 'Listing closure idempotency rehearsal failed';
  end if;
end
\$\$;

select set_config('request.jwt.claim.sub', '${adminId}', true);
select set_config('request.jwt.claims', '{"sub":"${adminId}","role":"authenticated"}', true);
do \$\$
declare
  v_outcome uuid;
  v_economics_event uuid;
begin
  select public.record_commercial_outcome(
    'marketplace_inquiry', '${inquiryId}', 'sale', 'EUR', 4800000, 240000,
    'settled', 'stripe_payment', 'synthetic-pi-rehearsal',
    'Synthetic settled outcome; no real payment or customer data.'
  ) into v_outcome;
  select public.record_commercial_unit_economics(
    v_outcome, 30000, 7000, 42000, 'settled', 'stripe_balance_transaction',
    'synthetic-txn-rehearsal', 'Synthetic complete unit economics.'
  ) into v_economics_event;
  if v_outcome is null or v_economics_event is null then
    raise exception 'Commercial outcome rehearsal did not return durable identifiers';
  end if;

  begin
    perform public.record_commercial_outcome(
      'marketplace_inquiry', '${inquiryId}', 'sale', 'EUR', 4800000, 240000,
      'documented', 'invoice', 'synthetic-invoice-rehearsal', null
    );
    raise exception 'Evidence downgrade rehearsal unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'Outcome evidence cannot be downgraded' then raise; end if;
  end;

  begin
    perform public.record_commercial_outcome(
      'marketplace_inquiry', '${inquiryId}', 'sale', 'EUR', 4800000, 250000,
      'settled', 'stripe_payment', 'synthetic-pi-rehearsal', null
    );
    raise exception 'Economics basis mutation rehearsal unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'Revenue or currency cannot change after unit economics are recorded; confirm the outcome basis before recording economics' then raise; end if;
  end;
end
\$\$;
reset role;

select json_build_object(
  'listingStatus', (select status from public.listings where id = '${listingId}'),
  'inquiryStatus', (select status from public.marketplace_inquiries where id = '${inquiryId}'),
  'offerEvents', (select count(*) from public.marketplace_inquiry_offer_events where inquiry_id = '${inquiryId}'),
  'sellerCounterEvents', (select count(*) from public.marketplace_inquiry_offer_events where inquiry_id = '${inquiryId}' and event_type = 'SELLER_COUNTERED'),
  'buyerResponseEvents', (select count(*) from public.marketplace_inquiry_offer_events where inquiry_id = '${inquiryId}' and event_type = 'BUYER_ACCEPTED_FOR_NEGOTIATION'),
  'lifecycleEvents', (select count(*) from public.listing_lifecycle_events where listing_id = '${listingId}'),
  'saleChannel', (select sale_channel from public.listing_lifecycle_events where listing_id = '${listingId}'),
  'outcomeEvents', (select count(*) from public.commercial_outcome_events where entity_id = '${inquiryId}'),
  'unitEconomicsEvents', (select count(*) from public.commercial_unit_economics_events where outcome_id = (select id from public.commercial_outcomes where entity_id = '${inquiryId}')),
  'grossAmountMinor', (select gross_amount_minor from public.commercial_outcomes where entity_id = '${inquiryId}'),
  'aerotradeRevenueMinor', (select aerotrade_revenue_minor from public.commercial_outcomes where entity_id = '${inquiryId}'),
  'contributionMarginMinor', (select contribution_margin_minor from public.commercial_outcomes where entity_id = '${inquiryId}'),
  'legacySellerFunnelEvents', (select count(*) from public.seller_funnel_events where seller_id = '${sellerId}'),
  'legacySellerFunnelChannelsNull', (select count(*) from public.seller_funnel_events where seller_id = '${sellerId}' and channel is null),
  'authorizationGate', 'passed',
  'idempotencyGate', 'passed',
  'evidenceDowngradeGate', 'passed',
  'economicsBasisGate', 'passed',
  'externalMessagesSent', 0
)::text;

rollback;
  `)
  const jsonLine = output.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)
  assert.ok(jsonLine, 'Transaction rehearsal did not return a structured readback')
  const result = JSON.parse(jsonLine)
  assert.deepEqual(result, expectedResult)
  return result
}
