import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isClosedInquiryStatus,
  normalizeInquiryStatus,
  parseInquiry,
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
  })

  const spam = validForm()
  spam.set('website', 'https://spam.invalid')
  assert.throws(() => parseInquiry(spam), /Unable to submit/)

  const tooShort = validForm()
  tooShort.set('message', 'Interested')
  assert.throws(() => parseInquiry(tooShort), /between 20 and 2,000/)
})

test('commercial status transitions use the closed status vocabulary', () => {
  assert.equal(normalizeInquiryStatus('NEGOTIATING'), 'NEGOTIATING')
  assert.equal(normalizeInquiryStatus('PAID'), null)
  assert.equal(isClosedInquiryStatus('WON'), true)
  assert.equal(isClosedInquiryStatus('CONTACTED'), false)
})
