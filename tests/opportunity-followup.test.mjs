import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getOpportunityFollowupCutoff,
  getSellerEnquiryEscalationCutoff,
  isPremiumListingRecoveryCandidate,
  isOpportunityFollowupDue,
  isSellerEnquiryEscalationDue,
  openInquiryStatuses,
  openQuoteStatuses,
} from '../src/utils/opportunity-followup.mjs'

test('commercial follow-up waits a full day and targets only open states', () => {
  const now = new Date('2026-08-29T12:00:00.000Z')
  assert.equal(getOpportunityFollowupCutoff(now), '2026-08-28T12:00:00.000Z')
  assert.equal(isOpportunityFollowupDue('2026-08-28T11:59:59.000Z', now), true)
  assert.equal(isOpportunityFollowupDue('2026-08-28T12:00:01.000Z', now), false)
  assert.deepEqual(openInquiryStatuses, ['NEW', 'SELLER_NOTIFIED'])
  assert.deepEqual(openQuoteStatuses, ['NEW'])
})

test('Premium listing recovery targets only old, unpublished Premium choices', () => {
  const now = new Date('2026-08-29T12:00:00.000Z')
  assert.equal(isPremiumListingRecoveryCandidate({ status: 'PENDING_PAYMENT', listingPlan: 'premium', createdAt: '2026-08-28T11:59:59.000Z' }, now), true)
  assert.equal(isPremiumListingRecoveryCandidate({ status: 'PENDING_PAYMENT', listingPlan: 'premium', createdAt: '2026-08-28T12:00:01.000Z' }, now), false)
  assert.equal(isPremiumListingRecoveryCandidate({ status: 'ACTIVE_PREMIUM', listingPlan: 'premium', createdAt: '2026-08-27T12:00:00.000Z' }, now), false)
  assert.equal(isPremiumListingRecoveryCandidate({ status: 'PENDING_PAYMENT', listingPlan: 'free', createdAt: '2026-08-27T12:00:00.000Z' }, now), false)
})

test('seller enquiry escalation waits 48 hours after an accepted reminder and only targets untouched leads', () => {
  const now = new Date('2026-08-29T12:00:00.000Z')
  assert.equal(getSellerEnquiryEscalationCutoff(now), '2026-08-27T12:00:00.000Z')
  assert.equal(isSellerEnquiryEscalationDue({ inquiryStatus: 'SELLER_NOTIFIED', reminderStatus: 'accepted', reminderAcceptedAt: '2026-08-27T11:59:59.000Z' }, now), true)
  assert.equal(isSellerEnquiryEscalationDue({ inquiryStatus: 'SELLER_NOTIFIED', reminderStatus: 'accepted', reminderAcceptedAt: '2026-08-27T12:00:01.000Z' }, now), false)
  assert.equal(isSellerEnquiryEscalationDue({ inquiryStatus: 'CONTACTED', reminderStatus: 'accepted', reminderAcceptedAt: '2026-08-26T12:00:00.000Z' }, now), false)
  assert.equal(isSellerEnquiryEscalationDue({ inquiryStatus: 'NEW', reminderStatus: 'failed', reminderAcceptedAt: '2026-08-26T12:00:00.000Z' }, now), false)
})
