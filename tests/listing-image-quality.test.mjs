import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyImageResponse,
  getAllowedListingImageHosts,
  getListingQualityTransition,
  isAllowedListingImageUrl,
  listingImageObservations,
  probeListingImages,
} from '../src/utils/listing-image-quality.mjs'

const host = 'vqdpveyshgvdhbsgskns.supabase.co'

test('listing image probes are restricted to the configured storage host', () => {
  assert.deepEqual(getAllowedListingImageHosts(`https://${host}`), [host])
  assert.equal(isAllowedListingImageUrl(`https://${host}/storage/v1/object/public/listing_images/a.jpg`, [host]), true)
  assert.equal(isAllowedListingImageUrl('http://127.0.0.1/private', [host]), false)
  assert.equal(isAllowedListingImageUrl('https://169.254.169.254/latest/meta-data', [host]), false)
  assert.equal(isAllowedListingImageUrl(`https://user:password@${host}/secret`, [host]), false)
})

test('only definitive provider responses count as missing', () => {
  assert.equal(classifyImageResponse(200), listingImageObservations.AVAILABLE)
  assert.equal(classifyImageResponse(404), listingImageObservations.DEFINITELY_MISSING)
  assert.equal(classifyImageResponse(400, '{"error":"NoSuchKey","message":"Object not found"}'), listingImageObservations.DEFINITELY_MISSING)
  assert.equal(classifyImageResponse(403), listingImageObservations.UNKNOWN)
  assert.equal(classifyImageResponse(503), listingImageObservations.UNKNOWN)
})

test('one reachable image keeps a listing healthy while unknown checks cannot quarantine it', async () => {
  const responses = new Map([
    ['missing.jpg', 404],
    ['available.jpg', 200],
  ])
  const fetchImpl = async (url) => new Response(null, { status: responses.get(String(url).split('/').at(-1)) || 503 })
  const available = await probeListingImages([
    `https://${host}/missing.jpg`,
    `https://${host}/available.jpg`,
  ], { allowedHostnames: [host], fetchImpl })
  assert.equal(available.observation, listingImageObservations.AVAILABLE)

  const unknown = await probeListingImages([`https://${host}/unknown.jpg`], { allowedHostnames: [host], fetchImpl })
  assert.equal(unknown.observation, listingImageObservations.UNKNOWN)
})

test('quarantine requires two distinct definitive checks', () => {
  const firstAt = '2026-08-29T07:00:00.000Z'
  assert.equal(getListingQualityTransition(null, listingImageObservations.DEFINITELY_MISSING, firstAt), 'SUSPECT')
  const suspect = { status: 'SUSPECT', last_checked_at: firstAt }
  assert.equal(getListingQualityTransition(suspect, listingImageObservations.DEFINITELY_MISSING, '2026-08-29T07:30:00.000Z'), 'NONE')
  assert.equal(getListingQualityTransition(suspect, listingImageObservations.UNKNOWN, '2026-08-29T08:30:00.000Z'), 'NONE')
  assert.equal(getListingQualityTransition(suspect, listingImageObservations.DEFINITELY_MISSING, '2026-08-29T08:30:00.000Z'), 'QUARANTINE')
  assert.equal(getListingQualityTransition(suspect, listingImageObservations.AVAILABLE, '2026-08-29T08:30:00.000Z'), 'RESOLVE')
})
