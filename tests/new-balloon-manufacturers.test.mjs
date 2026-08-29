import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildNewBalloonManufacturerFunnel,
  getNewBalloonManufacturer,
  inferNewBalloonManufacturerPreference,
  normalizeNewBalloonManufacturerPreference,
} from '../src/utils/new-balloon-manufacturers.mjs'

test('new-balloon manufacturer routes and preferences remain closed', () => {
  assert.equal(getNewBalloonManufacturer(' PASHA ')?.path, '/new-balloon/pasha')
  assert.equal(getNewBalloonManufacturer('schroeder')?.shortName, 'Schroeder')
  assert.equal(getNewBalloonManufacturer('unknown'), null)
  assert.equal(normalizeNewBalloonManufacturerPreference('unknown'), 'advice')
  assert.equal(inferNewBalloonManufacturerPreference('Schröder G42'), 'schroeder')
  assert.equal(inferNewBalloonManufacturerPreference('New Pasha 120'), 'pasha')
  assert.equal(inferNewBalloonManufacturerPreference('Pasha or Schroeder'), 'advice')
  assert.equal(inferNewBalloonManufacturerPreference('Cameron Z-350'), 'advice')
})

test('manufacturer funnel attributes outcomes to the latest operator proposal', () => {
  const funnel = buildNewBalloonManufacturerFunnel({
    quotes: [
      { id: 'quote-1', manufacturer_preference: 'advice' },
      { id: 'quote-2', manufacturer_preference: 'pasha' },
    ],
    proposals: [
      { id: 'proposal-1', quote_request_id: 'quote-1', manufacturer: 'schroeder', delivery_status: 'accepted', created_at: '2026-08-29T12:00:00Z' },
      { id: 'proposal-2', quote_request_id: 'quote-1', manufacturer: 'pasha', delivery_status: 'failed', created_at: '2026-08-28T12:00:00Z' },
    ],
    responses: [
      { proposal_id: 'proposal-1', response_type: 'INTERESTED' },
    ],
    outcomes: [
      { entity_type: 'quote_request', entity_id: 'quote-1', evidence_level: 'settled', currency: 'eur', aerotrade_revenue_minor: 250000 },
      { entity_type: 'marketplace_inquiry', entity_id: 'inquiry-1', evidence_level: 'settled', currency: 'EUR', aerotrade_revenue_minor: 999999 },
    ],
  })

  assert.equal(funnel.advice.preferredRequests, 1)
  assert.equal(funnel.pasha.preferredRequests, 1)
  assert.equal(funnel.pasha.proposals, 1)
  assert.equal(funnel.schroeder.proposals, 1)
  assert.equal(funnel.schroeder.acceptedProposals, 1)
  assert.equal(funnel.schroeder.buyerResponses, 1)
  assert.equal(funnel.schroeder.interestedResponses, 1)
  assert.equal(funnel.schroeder.declinedResponses, 0)
  assert.equal(funnel.schroeder.wonOutcomes, 1)
  assert.deepEqual(funnel.schroeder.settledRevenueMinorByCurrency, { EUR: 250000 })
})
