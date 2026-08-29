import assert from 'node:assert/strict'
import test from 'node:test'
import {
  newBalloonProposalResponseExpiry,
  signNewBalloonProposalCapability,
  verifyNewBalloonProposalCapability,
} from '../src/utils/new-balloon-proposal-capability.mjs'

const input = {
  proposalId: '11111111-1111-4111-8111-111111111111',
  quoteRequestId: '22222222-2222-4222-8222-222222222222',
  buyerEmail: ' Buyer@Example.com ',
  expiresAt: new Date('2026-09-30T23:59:59.999Z'),
  secret: 'a-service-secret-longer-than-twenty-characters',
}

test('new-balloon proposal capability is bound to proposal, quote, buyer and expiry', () => {
  const token = signNewBalloonProposalCapability(input)
  assert.ok(token)
  assert.equal(verifyNewBalloonProposalCapability({ ...input, token }, new Date('2026-08-29T10:00:00Z')), true)
  assert.equal(verifyNewBalloonProposalCapability({ ...input, buyerEmail: 'other@example.com', token }, new Date('2026-08-29T10:00:00Z')), false)
  assert.equal(verifyNewBalloonProposalCapability({ ...input, token }, new Date('2026-10-01T00:00:00Z')), false)
})

test('new-balloon response expiry uses the full proposal validity date', () => {
  assert.equal(newBalloonProposalResponseExpiry('2026-09-30')?.toISOString(), '2026-09-30T23:59:59.999Z')
  assert.equal(newBalloonProposalResponseExpiry('invalid'), null)
})
