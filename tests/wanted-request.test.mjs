import test from 'node:test'
import assert from 'node:assert/strict'
import { createWantedSubmissionKey, listingMatchesWantedRequest, normalizeWantedRequestStatus, parseWantedRequest } from '../src/utils/wanted-request.mjs'

const validForm = (overrides = {}) => {
  const values = {
    buyer_name: 'A Buyer',
    buyer_email: 'BUYER@example.com',
    buyer_phone: '',
    category: 'complete',
    location_preference: 'Europe',
    currency: 'EUR',
    budget_min: '20000',
    budget_max: '50000',
    details: 'I need a complete balloon with current documentation.',
    notify_on_match: 'yes',
    privacy_consent: 'yes',
    website: '',
    ...overrides,
  }
  const formData = new FormData()
  for (const [key, value] of Object.entries(values)) formData.set(key, value)
  return formData
}

test('parses and normalizes a consented wanted request', () => {
  const result = parseWantedRequest(validForm())
  assert.equal(result.buyer_email, 'buyer@example.com')
  assert.equal(result.budget_min_minor, 2_000_000)
  assert.equal(result.budget_max_minor, 5_000_000)
  assert.equal(result.notify_on_match, true)
})

test('rejects reversed budget and bot honeypot', () => {
  assert.throws(() => parseWantedRequest(validForm({ budget_min: '60000', budget_max: '50000' })), /Minimum budget/)
  assert.throws(() => parseWantedRequest(validForm({ website: 'https://spam.invalid' })), /Unable to submit/)
})

test('normalizes only known workflow statuses', () => {
  assert.equal(normalizeWantedRequestStatus('MATCHED'), 'MATCHED')
  assert.equal(normalizeWantedRequestStatus('WON'), null)
})

test('rate-limit keys are stable pseudonymous hashes and never raw IP addresses', () => {
  const key = createWantedSubmissionKey('203.0.113.7', 'Browser/1.0', 'a-long-server-side-secret-value')
  assert.equal(key?.length, 64)
  assert.equal(key, createWantedSubmissionKey('203.0.113.7', 'Browser/1.0', 'a-long-server-side-secret-value'))
  assert.doesNotMatch(key, /203\.0\.113\.7/)
  assert.equal(createWantedSubmissionKey('', 'Browser/1.0', 'a-long-server-side-secret-value'), null)
})

test('matches only active same-category listings inside the selected currency and ceiling', () => {
  const request = parseWantedRequest(validForm())
  assert.equal(listingMatchesWantedRequest({ category: 'complete', status: 'ACTIVE_PUBLIC', currency: 'EUR', price: 49_000 }, request), true)
  assert.equal(listingMatchesWantedRequest({ category: 'complete', status: 'ACTIVE_PUBLIC', currency: 'EUR', price: 55_000 }, request), false)
  assert.equal(listingMatchesWantedRequest({ category: 'burners', status: 'ACTIVE_PUBLIC', currency: 'EUR', price: 4_000 }, request), false)
  assert.equal(listingMatchesWantedRequest({ category: 'complete', status: 'SOLD', currency: 'EUR', price: 30_000 }, request), false)
})
