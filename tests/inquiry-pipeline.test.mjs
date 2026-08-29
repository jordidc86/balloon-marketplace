import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isClosedInquiryStatus,
  normalizeInquiryStatus,
  parseInquiry,
  parseSellerInquiryResponse,
} from '../src/utils/inquiry-safety.mjs'

const validForm = () => {
  const form = new FormData()
  for (const [key, value] of Object.entries({
    buyer_name: 'Jane Pilot',
    buyer_email: ' JANE@example.com ',
    buyer_phone: '+34 600 000 000',
    message: 'I am interested in this balloon and would like the maintenance history.',
    privacy_consent: 'yes',
  })) form.set(key, value)
  return form
}

test('buyer enquiries are normalized and require meaningful consented contact data', () => {
  assert.deepEqual(parseInquiry(validForm()), {
    buyer_name: 'Jane Pilot',
    buyer_email: 'jane@example.com',
    buyer_phone: '+34 600 000 000',
    message: 'I am interested in this balloon and would like the maintenance history.',
    initial_offer_amount_minor: null,
  })

  const spam = validForm()
  spam.set('website', 'https://spam.invalid')
  assert.throws(() => parseInquiry(spam), /Unable to submit/)

  const tooShort = validForm()
  tooShort.set('message', 'Interested')
  assert.throws(() => parseInquiry(tooShort), /between 20 and 2,000/)
})

test('buyer price indications and seller responses are bounded and non-ambiguous', () => {
  const offered = validForm()
  offered.set('offer_amount', '25000.50')
  assert.equal(parseInquiry(offered).initial_offer_amount_minor, 2_500_050)

  const sellerCounter = new FormData()
  sellerCounter.set('response', 'counter')
  sellerCounter.set('counter_amount', '27500')
  sellerCounter.set('response_note', 'Subject to inspection and final contract.')
  assert.deepEqual(parseSellerInquiryResponse(sellerCounter), {
    response: 'COUNTER',
    amount_minor: 2_750_000,
    note: 'Subject to inspection and final contract.',
  })

  const missingCounter = new FormData()
  missingCounter.set('response', 'COUNTER')
  assert.throws(() => parseSellerInquiryResponse(missingCounter), /counteroffer amount/i)

  const invalidAccept = new FormData()
  invalidAccept.set('response', 'ACCEPT')
  invalidAccept.set('counter_amount', '100')
  assert.throws(() => parseSellerInquiryResponse(invalidAccept), /only allowed/i)
})

test('commercial status transitions use the closed status vocabulary', () => {
  assert.equal(normalizeInquiryStatus('NEGOTIATING'), 'NEGOTIATING')
  assert.equal(normalizeInquiryStatus('PAID'), null)
  assert.equal(isClosedInquiryStatus('WON'), true)
  assert.equal(isClosedInquiryStatus('CONTACTED'), false)
})
