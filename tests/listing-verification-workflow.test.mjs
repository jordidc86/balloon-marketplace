import assert from 'node:assert/strict'
import test from 'node:test'

import { parseListingVerificationDecision } from '../src/utils/listing-verification.mjs'

test('verification approval requires a bounded identity basis, evidence and scope acknowledgement', () => {
  const form = new FormData()
  form.set('verification_action', 'verify')
  form.set('identity_review_basis', 'BUSINESS_REGISTRY')
  form.append('supporting_evidence_types', 'REGISTRATION')
  form.append('supporting_evidence_types', 'SERIAL_PLATE')
  form.set('review_scope_acknowledged', 'yes')
  assert.deepEqual(parseListingVerificationDecision(form), {
    action: 'verify',
    identity_review_basis: 'BUSINESS_REGISTRY',
    supporting_evidence_types: ['REGISTRATION', 'SERIAL_PLATE'],
    decision_reason: null,
  })
})

test('verification approval rejects browser bypasses and empty evidence', () => {
  const form = new FormData()
  form.set('verification_action', 'verify')
  form.set('identity_review_basis', 'invented')
  form.set('review_scope_acknowledged', 'yes')
  assert.throws(() => parseListingVerificationDecision(form), /identity review basis/i)
})

test('rejection uses a closed reason and unverify reopens safely', () => {
  const rejected = new FormData()
  rejected.set('verification_action', 'reject')
  rejected.set('decision_reason', 'INSUFFICIENT_EVIDENCE')
  assert.equal(parseListingVerificationDecision(rejected).decision_reason, 'INSUFFICIENT_EVIDENCE')

  const unverify = new FormData()
  unverify.set('verification_action', 'unverify')
  assert.deepEqual(parseListingVerificationDecision(unverify), {
    action: 'unverify',
    identity_review_basis: null,
    supporting_evidence_types: [],
    decision_reason: 'OTHER_REVIEW_REQUIRED',
  })
})
