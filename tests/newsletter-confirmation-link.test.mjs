import test from 'node:test'
import assert from 'node:assert/strict'
import { newsletterConfirmationLinkKind } from '../src/utils/newsletter-confirmation-link.mjs'

const now = Date.parse('2026-10-28T12:00:00Z')
const id = '5c1d1bca-5c56-4c96-bab1-bf537ad9b93a'
const signedFields = { expires: String(now + 60_000), token: 'a'.repeat(64) }

test('direct entry and tracking parameters show signup, never a broken confirmation', () => {
  assert.equal(newsletterConfirmationLinkKind({}, now), 'signup')
  assert.equal(newsletterConfirmationLinkKind({ utm_source: 'social' }, now), 'signup')
})

test('only complete unexpired links show the corresponding confirmation form', () => {
  assert.equal(newsletterConfirmationLinkKind({ id, ...signedFields }, now), 'account')
  assert.equal(newsletterConfirmationLinkKind({ subscription: id, cycle: '1', ...signedFields }, now), 'public')
  for (const params of [
    { id }, { id: '', ...signedFields }, { id, ...signedFields, expires: String(now - 1) },
    { id, ...signedFields, token: 'malformed' }, { id: [id, id], ...signedFields },
    { subscription: id, ...signedFields }, { subscription: id, cycle: '0', ...signedFields },
    { id, subscription: id, cycle: '1', ...signedFields },
    { subscription: id, cycle: '1', ...signedFields, expires: String(now + 8 * 86400000) },
  ]) assert.equal(newsletterConfirmationLinkKind(params, now), 'invalid')
})
