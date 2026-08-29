import assert from 'node:assert/strict'
import test from 'node:test'

import { assertStoredListingRequiredFields, getStoredListingPublicationIssues, parseListingSubmission } from '../src/utils/listing-submission.mjs'

const validListing = () => {
  const form = new FormData()
  for (const [key, value] of Object.entries({
    category: 'complete',
    condition: 'Used-Good',
    currency: 'EUR',
    title: 'Cameron Z-105 complete balloon',
    description: 'Complete balloon with documented history and normal wear for its age.',
    price: '25000',
    location_country: 'Spain',
    contact_email: 'seller@example.com',
    manufacturer: 'Cameron',
    model: 'Z-105',
    year: '2018',
    hours: '145',
    serial: '12345',
    seller_declaration: 'yes',
    supporting_documents_available: 'yes',
  })) form.set(key, value)
  return form
}

test('listing submissions are normalized and retain seller-declared trust evidence', () => {
  const form = validListing()
  form.set('location_country', ' España ')
  const parsed = parseListingSubmission(form)
  assert.equal(parsed.price, 25000)
  assert.equal(parsed.details.serial, '12345')
  assert.equal(parsed.details.supporting_documents_available, true)
  assert.equal(parsed.details.seller_declaration, true)
  assert.equal(parsed.location_country, 'Spain')
})

test('listing submissions reject browser-bypass values', () => {
  const invalidCategory = validListing()
  invalidCategory.set('category', 'aircraft')
  assert.throws(() => parseListingSubmission(invalidCategory), /category is invalid/)

  const invalidPrice = validListing()
  invalidPrice.set('price', '-1')
  assert.throws(() => parseListingSubmission(invalidPrice), /Price is invalid/)

  const missingSerial = validListing()
  missingSerial.set('serial', '')
  assert.throws(() => parseListingSubmission(missingSerial), /Serial number/)
})

test('historical flight listings cannot be republished with missing aircraft identity fields', () => {
  const listing = {
    category: 'complete',
    details: { manufacturer: 'Cameron', model: 'Z-120', year: 2004, hours: 420, serial: '' },
  }
  assert.deepEqual(getStoredListingPublicationIssues(listing), ['MISSING_SERIAL'])
  assert.throws(() => assertStoredListingRequiredFields(listing), /MISSING_SERIAL/)
  assert.equal(assertStoredListingRequiredFields({ ...listing, details: { ...listing.details, serial: '1234' } }), true)
  assert.equal(assertStoredListingRequiredFields({ category: 'burners', details: {} }), true)
})
