import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCommercialOutcome } from '../src/utils/commercial-outcome.mjs'

const form = (values) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

test('commercial outcomes normalize monetary evidence to minor units', () => {
  assert.deepEqual(parseCommercialOutcome(form({
    currency: 'eur',
    evidence_level: 'documented',
    outcome_type: 'sale',
    evidence_source: 'invoice',
    evidence_reference: 'INV-2026-0042',
    gross_amount: '12500.50',
    aerotrade_revenue: '250,25',
    outcome_notes: 'Invoice reviewed.',
  })), {
    outcome_type: 'sale',
    currency: 'EUR',
    gross_amount_minor: 1_250_050,
    aerotrade_revenue_minor: 25_025,
    evidence_level: 'documented',
    evidence_source: 'invoice',
    evidence_reference: 'INV-2026-0042',
    notes: 'Invoice reviewed.',
  })
})

test('commercial outcomes reject impossible revenue and unsupported evidence', () => {
  assert.throws(() => parseCommercialOutcome(form({
    currency: 'EUR', evidence_level: 'settled', evidence_source: 'bank_transfer', evidence_reference: 'BANK-001', outcome_type: 'sale', gross_amount: '100', aerotrade_revenue: '101',
  })), /cannot exceed/)
  assert.throws(() => parseCommercialOutcome(form({
    currency: 'EUR', evidence_level: 'assumed', evidence_source: 'operator_report', outcome_type: 'sale', gross_amount: '100', aerotrade_revenue: '10',
  })), /Evidence level/)
})

test('settled revenue requires a payment reference and payment evidence source', () => {
  assert.throws(() => parseCommercialOutcome(form({
    currency: 'EUR', evidence_level: 'settled', evidence_source: 'invoice', evidence_reference: 'INV-1', outcome_type: 'intermediation', gross_amount: '1000', aerotrade_revenue: '100',
  })), /bank or Stripe/)
  assert.throws(() => parseCommercialOutcome(form({
    currency: 'EUR', evidence_level: 'documented', evidence_source: 'contract', evidence_reference: '', outcome_type: 'sale', gross_amount: '1000', aerotrade_revenue: '100',
  })), /document source and reference/)
  assert.throws(() => parseCommercialOutcome(form({
    currency: 'EUR', evidence_level: 'reported', evidence_source: 'operator_report', outcome_type: 'sale', gross_amount: '0', aerotrade_revenue: '0',
  })), /positive gross amount/)
})
