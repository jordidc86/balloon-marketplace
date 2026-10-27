import test from 'node:test'
import assert from 'node:assert/strict'
import { readOnlyFetch, readAllRows, readAllStripe, reconcileChargeReceipts } from '../scripts/lib/read-only-audit.mjs'

test('audit transport blocks writes before issuing any network request', () => {
  const saved = global.fetch
  let calls = 0
  global.fetch = () => { calls++; return Promise.resolve(new Response()) }
  try {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.throws(() => readOnlyFetch('https://invalid.test', { method }), /non-read/)
    assert.throws(() => readOnlyFetch(new Request('https://invalid.test', { method: 'POST' })), /non-read/)
    assert.equal(calls, 0)
  } finally { global.fetch = saved }
})
test('database pagination handles server caps smaller than requested page size', async () => {
  const source = Array.from({ length: 1205 }, (_, id) => ({ id }))
  const rows = await readAllRows(() => ({ range: async (from, to) => ({ data: source.slice(from, Math.min(from + 100, to + 1)), count: source.length }) }))
  assert.deepEqual(rows, source)
})
test('database pagination rejects drift, missing counts and truncation', async () => {
  let page = 0
  await assert.rejects(readAllRows(() => ({ range: async () => ({ data: [{ id: page++ }], count: page === 1 ? 3 : 4 }) })), /changed/)
  await assert.rejects(readAllRows(() => ({ range: async () => ({ data: [], count: 1 }) })), /incomplete/)
  await assert.rejects(readAllRows(() => ({ range: async () => ({ data: [], count: null }) })), /completeness/)
})
test('Stripe pagination reads all pages and fails closed on broken cursor or budget', async () => {
  const requests = []
  const result = await readAllStripe(async (params) => {
    requests.push(params)
    return params.starting_after ? { data: [{ id: 'two' }], has_more: false } : { data: [{ id: 'one' }], has_more: true }
  }, { created: { gte: 1, lt: 2 } })
  assert.equal(result.data.length, 2)
  assert.equal(requests[1].starting_after, 'one')
  assert.deepEqual(requests[1].created, { gte: 1, lt: 2 })
  await assert.rejects(readAllStripe(async () => ({ data: [], has_more: true })), /progress/)
  await assert.rejects(readAllStripe(async () => ({ data: [{ id: 'one' }], has_more: true }), {}, 1), /limit/)
})
test('payment reconciliation uses charge identity, mode and amount, not equal row counts', () => {
  const charge = { id: 'ch_1', amount: 2000, currency: 'eur', livemode: true }
  const receipt = { charge_id: 'ch_1', amount_minor: 2000, currency: 'eur', livemode: true, accepted_at: '2026-10-27' }
  assert.equal(reconcileChargeReceipts([charge, charge], [receipt]).matched, 1)
  assert.equal(reconcileChargeReceipts([charge], [{ ...receipt, charge_id: 'ch_other' }]).missing, 1)
  assert.equal(reconcileChargeReceipts([charge], [{ ...receipt, livemode: false }]).inconsistent, 1)
  assert.equal(reconcileChargeReceipts([charge], [receipt, receipt]).inconsistent, 1)
  assert.equal(reconcileChargeReceipts([charge], [receipt]).status, 'verified')
})
