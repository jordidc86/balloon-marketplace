import assert from 'node:assert/strict'
import test from 'node:test'
import { newBalloonProposalFingerprint, parseNewBalloonProposal } from '../src/utils/new-balloon-proposal.mjs'

const form = (overrides = {}) => {
  const data = new FormData()
  const values = {
    proposal_manufacturer: 'pasha', proposal_currency: 'eur', proposal_amount_min: '85000', proposal_amount_max: '95000.50',
    proposal_configuration: 'Complete four-passenger balloon with envelope, basket and burner.', proposal_delivery_guidance: 'Indicative factory lead time: confirm before order.',
    proposal_valid_until: '2026-09-15', proposal_terms: 'Indicative and non-binding; taxes and transport subject to confirmation.', ...overrides,
  }
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

test('new-balloon proposals normalize a bounded non-binding price range', () => {
  const proposal = parseNewBalloonProposal(form(), new Date('2026-08-29T10:00:00Z'))
  assert.equal(proposal.manufacturer, 'pasha')
  assert.equal(proposal.currency, 'EUR')
  assert.equal(proposal.amount_min_minor, 8_500_000)
  assert.equal(proposal.amount_max_minor, 9_500_050)
  assert.equal(newBalloonProposalFingerprint('quote-1', proposal), newBalloonProposalFingerprint('quote-1', proposal))
})

test('new-balloon proposals reject reversed ranges, stale validity and weak configuration', () => {
  const now = new Date('2026-08-29T10:00:00Z')
  assert.throws(() => parseNewBalloonProposal(form({ proposal_amount_min: '100000', proposal_amount_max: '90000' }), now), /cannot exceed/)
  assert.throws(() => parseNewBalloonProposal(form({ proposal_valid_until: '2026-08-28' }), now), /between today/)
  assert.throws(() => parseNewBalloonProposal(form({ proposal_configuration: 'Balloon' }), now), /meaningful/)
})

