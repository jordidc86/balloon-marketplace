import test from 'node:test'
import assert from 'node:assert/strict'
import { storeSellerInquiryStatus } from '../src/utils/inquiry-status.mjs'

const now = '2026-10-03T12:00:00.000Z'

function database(result) {
  const calls = []
  const query = {
    from: (table) => { calls.push(['from', table]); return query },
    update: (values) => { calls.push(['update', values]); return query },
    eq: (...args) => { calls.push(['eq', ...args]); return query },
    select: (columns) => { calls.push(['select', columns]); return query },
    single: async () => typeof result === 'function' ? result(calls) : result,
  }
  return { query, calls }
}

for (const status of ['CONTACTED', 'QUALIFIED', 'NEGOTIATING', 'LOST', 'SPAM']) {
  test(`saves and verifies ${status} without sending a buyer response`, async () => {
    const { query, calls } = database({ data: { id: 'test-inquiry', status }, error: null })
    assert.deepEqual(await storeSellerInquiryStatus(query, 'test-inquiry', status, now), { status })
    assert.deepEqual(calls, [
      ['from', 'marketplace_inquiries'],
      ['update', { status, last_activity_at: now, closed_at: ['LOST', 'SPAM'].includes(status) ? now : null }],
      ['eq', 'id', 'test-inquiry'],
      ['select', 'id,status'],
    ])
  })
}

test('rejects invalid and centrally managed statuses before writing', async () => {
  const { query, calls } = database(null)
  for (const status of ['WON', 'NEW', 'SELLER_NOTIFIED', 'PAID', '', null]) {
    await assert.rejects(storeSellerInquiryStatus(query, 'test-inquiry', status, now), /Invalid enquiry status/)
  }
  assert.equal(calls.length, 0)
})

test('does not report success on database errors or missing permission', async () => {
  for (const result of [{ data: null, error: { code: '42501' } }, { data: null, error: null }]) {
    const { query } = database(result)
    await assert.rejects(storeSellerInquiryStatus(query, 'test-inquiry', 'CONTACTED', now), /Could not verify/)
  }
})

test('does not report success if readback differs from the requested inquiry or status', async () => {
  for (const data of [{ id: 'other-inquiry', status: 'CONTACTED' }, { id: 'test-inquiry', status: 'NEGOTIATING' }]) {
    const { query } = database({ data, error: null })
    await assert.rejects(storeSellerInquiryStatus(query, 'test-inquiry', 'CONTACTED', now), /Could not verify/)
  }
})

test('repeated saves preserve Contacted and never create responses', async () => {
  const { query, calls } = database({ data: { id: 'test-inquiry', status: 'CONTACTED' }, error: null })
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.deepEqual(await storeSellerInquiryStatus(query, 'test-inquiry', 'CONTACTED', now), { status: 'CONTACTED' })
  }
  assert.equal(calls.filter(([method]) => method === 'update').length, 3)
  assert.ok(calls.filter(([method]) => method === 'from').every(([, table]) => table === 'marketplace_inquiries'))
})
