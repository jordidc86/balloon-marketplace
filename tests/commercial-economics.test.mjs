import test from 'node:test'
import assert from 'node:assert/strict'
import { commercialContributionMinor, parseCommercialEconomics } from '../src/utils/commercial-economics.mjs'

const form = (overrides = {}) => new Map(Object.entries({
  direct_cost: '100.00',
  payment_fee: '2,50',
  tax_amount: '21',
  economics_evidence_level: 'documented',
  economics_evidence_source: 'invoice',
  economics_evidence_reference: 'INV-2026-001',
  economics_notes: 'Direct commercial costs reviewed.',
  ...overrides,
}))

test('commercial economics normalize evidence and preserve negative contribution', () => {
  const parsed = parseCommercialEconomics(form())
  assert.deepEqual(parsed, {
    direct_cost_minor: 10_000,
    payment_fee_minor: 250,
    tax_amount_minor: 2_100,
    economics_evidence_level: 'documented',
    economics_evidence_source: 'invoice',
    economics_evidence_reference: 'INV-2026-001',
    economics_notes: 'Direct commercial costs reviewed.',
  })
  assert.equal(commercialContributionMinor(20_000, parsed), 7_650)
  assert.equal(commercialContributionMinor(5_000, parsed), -7_350)
})

test('commercial economics never infer missing costs as zero', () => {
  assert.equal(commercialContributionMinor(10_000, null), null)
  assert.equal(commercialContributionMinor(10_000, { direct_cost_minor: 0, payment_fee_minor: null, tax_amount_minor: 0 }), null)
})

test('reported and settled economics require matching evidence', () => {
  assert.throws(() => parseCommercialEconomics(form({ economics_evidence_level: 'reported', economics_evidence_source: 'invoice' })), /operator report/)
  assert.throws(() => parseCommercialEconomics(form({ economics_evidence_level: 'settled', economics_evidence_source: 'invoice' })), /bank statement or Stripe/)
  assert.throws(() => parseCommercialEconomics(form({ economics_evidence_level: 'documented', economics_evidence_reference: '' })), /reference/)
  assert.throws(() => parseCommercialEconomics(form({ direct_cost: '-1' })), /invalid/)
})
