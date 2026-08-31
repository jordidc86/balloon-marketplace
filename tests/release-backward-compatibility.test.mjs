import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertNoHardDestructiveDdl,
  assertSellerFunnelCompatibility,
  assertStableFunctionContract,
  assertVocabularyExpansion,
  extractConstraintVocabulary,
  extractFunctionContract,
  validateLiveVocabulary,
} from '../scripts/lib/release-backward-compatibility.mjs'

test('extracts one closed SQL check vocabulary and proves expansion', () => {
  const base = extractConstraintVocabulary("alter table x add constraint sample_check check (status in ('A','B'));", 'sample_check', 'status')
  const candidate = extractConstraintVocabulary("alter table x add constraint sample_check check (status in ('A','B','C'));", 'sample_check', 'status')
  assert.deepEqual(base, ['A', 'B'])
  assert.deepEqual(assertVocabularyExpansion({ name: 'sample', baseValues: base, candidateValues: candidate }), {
    name: 'sample', baseValueCount: 2, candidateValueCount: 3, addedValues: ['C'],
  })
  assert.throws(() => assertVocabularyExpansion({ name: 'sample', baseValues: candidate, candidateValues: base }), /removes values/)
})

test('requires a stable service-only SQL function contract', () => {
  const sql = `
    create or replace function public.do_work(p_id uuid, p_note text default null)
    returns table(event_id uuid, status text)
    language plpgsql security definer set search_path = public, pg_temp
    as $$ begin return; end; $$;
    revoke all on function public.do_work(uuid, text) from public, anon, authenticated;
    grant execute on function public.do_work(uuid, text) to service_role;
  `
  const contract = extractFunctionContract(sql, 'do_work')
  assert.equal(contract.revokePublicAnonAuthenticated, true)
  assert.equal(contract.grantServiceRole, true)
  assert.deepEqual(assertStableFunctionContract({ name: 'do_work', baseContract: contract, candidateContract: contract }), { name: 'do_work', stable: true })
  assert.throws(() => assertStableFunctionContract({
    name: 'do_work',
    baseContract: contract,
    candidateContract: { ...contract, returns: 'event_id uuid' },
  }), /return contract/)
})

test('blocks hard destructive DDL but permits a constraint replacement', () => {
  assert.deepEqual(assertNoHardDestructiveDdl([{ path: 'safe.sql', sql: 'alter table x drop constraint if exists old; alter table x add constraint new check (a > 0);' }]), {
    migrationsChecked: 1, hardDestructiveOperations: 0,
  })
  assert.throws(() => assertNoHardDestructiveDdl([{ path: 'unsafe.sql', sql: 'alter table x drop column legacy;' }]), /hard destructive DDL/)
})

test('live values must remain accepted by the candidate vocabulary', () => {
  assert.deepEqual(validateLiveVocabulary({
    name: 'status',
    observedValues: [{ value: 'A', count: 2 }, { value: 'B', count: 1 }],
    allowedValues: ['A', 'B', 'C'],
  }), { name: 'status', rowCount: 3, distinctValueCount: 2, unexpectedValueCount: 0 })
  assert.throws(() => validateLiveVocabulary({
    name: 'status', observedValues: [{ value: 'OLD', count: 1 }], allowedValues: ['A'],
  }), /live values rejected/)
})

test('old seller stages remain valid with a null channel', () => {
  const sql = `
    alter table public.seller_funnel_events add column if not exists channel text;
    alter table public.seller_funnel_events add constraint seller_funnel_events_stage_check
      check (stage in ('SELL_PAGE_VIEWED','FORM_STARTED','LISTING_SUBMITTED','LISTING_SHARED')),
      add constraint channel_check check ((stage = 'LISTING_SHARED' and channel in ('email')) or (stage <> 'LISTING_SHARED' and channel is null));
  `
  assert.deepEqual(assertSellerFunnelCompatibility(sql, ['SELL_PAGE_VIEWED', 'FORM_STARTED', 'LISTING_SUBMITTED']), {
    baseStageCount: 3, oldEventsUseNullChannel: true,
  })
})
