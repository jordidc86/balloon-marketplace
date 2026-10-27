import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transpileModule, ModuleKind } from 'typescript'
import sharp from 'sharp'
import { renderSocialCardJpeg } from '../src/utils/social-card-renderer.mjs'
import { withSocialBudget, assertSocialBudget, assertSocialImageUrl } from '../src/utils/social-request.mjs'

const receiptSource = (await readFile(new URL('../src/utils/social-publication-receipt.ts', import.meta.url), 'utf8'))
  .replaceAll("@/utils/", new URL('../src/utils/', import.meta.url).href)
const { publishSocialPlacement } = await import(`data:text/javascript;base64,${Buffer.from(transpileModule(receiptSource, { compilerOptions: { module: ModuleKind.ESNext } }).outputText).toString('base64')}`)
const input = { runDate: '2026-10-27', contentKind: 'listing', contentId: 'listing-one', contentVariant: 'default', network: 'facebook', placement: 'post', destinationUrl: 'https://aerotrade.app/catalog/listing-one' }

function database({ failAccepted = false } = {}) {
  let row = null
  return {
    get row() { return row },
    from() {
      let update, insert
      const filters = []
      const query = {
        select() { return query },
        eq(key, value) { filters.push((row) => row[key] === value); return query },
        in(key, values) { filters.push((row) => values.includes(row[key])); return query },
        update(value) { update = value; return query },
        insert(value) { insert = value; return query },
        maybeSingle: execute, single: execute,
        then(resolve, reject) { return execute().then(resolve, reject) },
      }
      async function execute() {
        if (insert) {
          if (row) return { data: null, error: { code: '23505' } }
          row = { id: 'receipt-one', retryable: false, provider_id: null, ...insert }
        } else if (update) {
          if (!row || !filters.every((filter) => filter(row))) return { data: null, error: null }
          if (failAccepted && update.status === 'accepted') return { data: null, error: { code: 'DB_FAILURE' } }
          row = { ...row, ...update }
        }
        return { data: row ? { ...row } : null, error: null }
      }
      return query
    },
  }
}

test('two concurrent social workers publish a placement once', async () => {
  const db = database()
  let calls = 0
  const publish = async () => { calls++; await new Promise((resolve) => setTimeout(resolve, 10)); return 'meta-id' }
  await Promise.all([publishSocialPlacement(db, input, publish), publishSocialPlacement(db, input, publish)])
  assert.equal(calls, 1)
  assert.equal(db.row.status, 'accepted')
  assert.equal((await publishSocialPlacement(db, input, publish)).duplicate, true)
  assert.equal(calls, 1)
})
test('known Meta identifier survives database failure and cannot be retried', async () => {
  const db = database({ failAccepted: true })
  let calls = 0
  const publish = async () => { calls++; return 'accepted-meta-id' }
  await assert.rejects(publishSocialPlacement(db, input, publish), /do not retry/)
  assert.equal(db.row.provider_id, 'accepted-meta-id')
  assert.equal(db.row.retryable, false)
  assert.equal((await publishSocialPlacement(db, input, publish)).skipped, true)
  assert.equal(calls, 1)
})
test('ambiguous network timeout never retries publication', async () => {
  const db = database()
  let calls = 0
  const publish = async () => { calls++; throw new Error('request timeout') }
  await assert.rejects(publishSocialPlacement(db, input, publish), /timeout/)
  assert.equal(db.row.retryable, false)
  assert.equal((await publishSocialPlacement(db, input, publish)).skipped, true)
  assert.equal(calls, 1)
})
test('workflow deadlines are isolated and prevent further network operations', async () => {
  await withSocialBudget(1, async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.throws(() => assertSocialBudget(), /timeout/i)
  })
  assert.doesNotThrow(() => assertSocialBudget())
})
test('social image sources exclude private hosts and credential-bearing URLs', () => {
  for (const url of ['https://127.0.0.1/image', 'http://images.unsplash.com/image', 'https://user:pass@images.unsplash.com/image', 'https://images.unsplash.com:444/image']) assert.throws(() => assertSocialImageUrl(url))
  assert.equal(assertSocialImageUrl('https://images.unsplash.com/photo'), 'https://images.unsplash.com/photo')
})
test('local social renderer produces bounded JPEG post/story and rejects SVG inputs', async () => {
  const source = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#39769b' } }).png().toBuffer()
  const listing = { title: 'Test balloon <markup> & long title '.repeat(8), price: 12000, currency: 'EUR', condition: 'Used', details: { hours: 123 } }
  for (const format of ['post', 'story']) {
    const result = await renderSocialCardJpeg(source, listing, format)
    const metadata = await sharp(result).metadata()
    assert.equal(metadata.format, 'jpeg')
    assert.equal(metadata.width, 1080)
    assert.equal(metadata.height, format === 'story' ? 1920 : 1080)
  }
  await assert.rejects(renderSocialCardJpeg(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'), listing, 'post'), /single JPEG/)
})
