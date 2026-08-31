import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildProductionVerificationOrigins,
  classifyExactProductionDeploy,
  parseNetlifyDeployList,
  productionEndpointContracts,
  verifyPublicEndpointResponse,
} from '../scripts/lib/production-live-verification.mjs'

const commit = 'a'.repeat(40)
const readyDeploy = {
  id: 'abc123',
  name: 'aerotrade-mvp-app',
  state: 'ready',
  context: 'production',
  branch: 'production',
  commit_ref: commit,
  ssl_url: 'https://aerotrade.app',
  published_at: '2026-08-31T20:00:00Z',
}

test('parses a Netlify deploy list without trusting surrounding CLI output', () => {
  assert.deepEqual(parseNetlifyDeployList(`notice\n${JSON.stringify([readyDeploy])}\n`), [readyDeploy])
})

test('selects exactly one ready production deploy for the expected commit', () => {
  assert.deepEqual(classifyExactProductionDeploy([readyDeploy], commit), { status: 'ready', deploy: readyDeploy })
  assert.deepEqual(classifyExactProductionDeploy([], commit), { status: 'waiting', deploy: null })
  assert.equal(classifyExactProductionDeploy([{ ...readyDeploy, state: 'building' }], commit).status, 'waiting')
  assert.equal(classifyExactProductionDeploy([{ ...readyDeploy, state: 'error' }], commit).status, 'failed')
  assert.throws(() => classifyExactProductionDeploy([readyDeploy, { ...readyDeploy, id: 'def456' }], commit), /More than one/)
})

test('derives immutable and canonical HTTPS origins from provider evidence', () => {
  assert.deepEqual(buildProductionVerificationOrigins(readyDeploy), {
    immutable: 'https://abc123--aerotrade-mvp-app.netlify.app',
    canonical: 'https://aerotrade.app',
  })
  assert.throws(() => buildProductionVerificationOrigins({ ...readyDeploy, ssl_url: 'http://aerotrade.app' }), /must use HTTPS/)
})

test('public release endpoints require HTTP 200, correct media type and a marker', () => {
  const home = productionEndpointContracts[0]
  assert.deepEqual(verifyPublicEndpointResponse({
    contract: home,
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: '<title>AeroTrade</title>',
  }), { path: '/', status: 200, contentType: 'text/html', markerVerified: true })
  assert.throws(() => verifyPublicEndpointResponse({ contract: home, status: 503, contentType: 'text/html', body: 'AeroTrade' }), /HTTP 200/)
  assert.throws(() => verifyPublicEndpointResponse({ contract: home, status: 200, contentType: 'application/json', body: 'AeroTrade' }), /wrong content type/)
  assert.throws(() => verifyPublicEndpointResponse({ contract: home, status: 200, contentType: 'text/html', body: 'Other' }), /missing its release marker/)
})
