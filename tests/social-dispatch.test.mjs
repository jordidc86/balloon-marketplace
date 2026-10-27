import test from 'node:test'
import assert from 'node:assert/strict'
import scheduled, { config } from '../netlify/functions/social-scheduled.mjs'

test('the existing social schedule queues a bounded authenticated job without claiming publication', async () => {
  const savedFetch = global.fetch
  const savedSecret = process.env.CRON_SECRET
  process.env.CRON_SECRET = 'local-test-secret'
  const calls = []
  global.fetch = async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 202 }) }
  try {
    assert.equal(config.schedule, '0 7 * * *')
    const response = await scheduled()
    assert.equal(response.status, 202)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://aerotrade.app/.netlify/functions/social-publish-background')
    assert.equal(calls[0].init.method, 'POST')
    assert.equal(calls[0].init.headers.Authorization, 'Bearer local-test-secret')
    assert.ok(Number.isFinite(Date.parse(JSON.parse(calls[0].init.body).scheduledAt)))
    assert.ok(calls[0].init.signal instanceof AbortSignal)
    global.fetch = async () => new Response(null, { status: 200 })
    assert.equal((await scheduled()).status, 502)
    delete process.env.CRON_SECRET
    assert.equal((await scheduled()).status, 500)
  } finally {
    global.fetch = savedFetch
    if (savedSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = savedSecret
  }
})
