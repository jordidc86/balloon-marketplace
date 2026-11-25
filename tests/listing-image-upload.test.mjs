import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { submitListingImages } from '../src/utils/listing-image-upload.mjs'
import { orderListingImages } from '../src/utils/listing-image-order.mjs'

const require = createRequire(import.meta.url)
const { redirect, unstable_rethrow } = require('next/navigation')
const url = name => `https://example.supabase.co/storage/v1/object/public/listing_images/owner/batch/${name}.jpg`

function fixture(saveListing) {
  const objects = new Set(), removed = [], saved = [], progress = []
  return {
    objects, removed, saved, progress,
    input: {
      files: ['0', '1', '2'], existingUrls: [url('existing')],
      uploadImage: async name => { objects.add(name); return { path: name, url: url(name) } },
      removeUploadedImages: async paths => { removed.push(...paths); paths.forEach(p => objects.delete(p)) },
      saveListing: async urls => { saved.push(urls); return saveListing?.(urls) },
      onProgress: percent => progress.push(percent),
    },
  }
}

test('a successful create or edit redirect retains all committed photos', async () => {
  for (const destination of ['/catalog/example?success=true&plan=free', '/catalog/example?updated=true']) {
    const f = fixture(() => redirect(destination))
    let caught
    try { await submitListingImages(f.input) } catch (error) { caught = error }
    assert.match(caught?.digest || '', /^NEXT_REDIRECT;/)
    assert.throws(() => unstable_rethrow(caught), error => error === caught)
    assert.deepEqual([...f.objects], ['0', '1', '2'])
    assert.deepEqual(f.removed, [])
    assert.deepEqual(f.saved, [[url('existing'), url('0'), url('1'), url('2')]])
    assert.deepEqual(f.progress, [33, 67, 100])
  }
})

test('partial upload failure cleans only this attempt and never submits a listing', async () => {
  const f = fixture()
  const upload = f.input.uploadImage
  f.input.uploadImage = async name => {
    if (name === '1') throw new Error('Storage unavailable')
    return upload(name)
  }
  await assert.rejects(submitListingImages(f.input), /Storage unavailable/)
  assert.deepEqual(f.removed, ['0'])
  assert.equal(f.objects.size, 0)
  assert.deepEqual(f.saved, [])
})

test('cleanup failure preserves the original upload error', async () => {
  const f = fixture(), cleanupErrors = []
  const upload = f.input.uploadImage
  f.input.uploadImage = async name => { if (name === '1') throw new Error('Original upload error'); return upload(name) }
  f.input.removeUploadedImages = async () => { throw new Error('Cleanup unavailable') }
  f.input.onCleanupError = error => cleanupErrors.push(error.message)
  await assert.rejects(submitListingImages(f.input), /Original upload error/)
  assert.deepEqual(cleanupErrors, ['Cleanup unavailable'])
  assert.deepEqual(f.saved, [])
})

test('server validation or an uncertain response after persistence cannot delete uploaded objects', async () => {
  for (const message of ['Validation rejected', 'Response lost after database commit']) {
    const f = fixture(() => { throw new Error(message) })
    await assert.rejects(submitListingImages(f.input), new RegExp(message))
    assert.deepEqual([...f.objects], ['0', '1', '2'])
    assert.deepEqual(f.removed, [])
    assert.equal(f.saved.length, 1)
  }
})

test('editing with existing photos performs no upload or cleanup', async () => {
  const f = fixture(() => ({ saved: true }))
  f.input.files = []
  assert.deepEqual(await submitListingImages(f.input), { saved: true })
  assert.deepEqual(f.saved, [[url('existing')]])
  assert.deepEqual(f.removed, [])
})

test('gallery and editor put the cover first and preserve numeric upload order despite shuffled rows', () => {
  const rows = [2, 10, 1, 0].map(i => ({ url: url(String(i)), is_primary: i === 0, created_at: '2026-11-25T07:55:59Z' }))
  const original = rows.map(i => i.url)
  assert.deepEqual(orderListingImages(rows).map(i => i.url), [0, 1, 2, 10].map(i => url(String(i))))
  assert.deepEqual(rows.map(i => i.url), original)
  assert.deepEqual(orderListingImages(undefined), [])
})

test('separate upload batches follow their creation time after the selected cover', () => {
  const rows = [
    {url: url('a'), created_at: '2026-11-25T10:00:00Z'},
    {url: url('z'), created_at: '2026-11-25T09:00:00Z'},
    {url: url('cover'), is_primary: true, created_at: '2026-11-25T11:00:00Z'},
  ]
  assert.deepEqual(orderListingImages(rows).map(i => i.url), [url('cover'), url('z'), url('a')])
})
