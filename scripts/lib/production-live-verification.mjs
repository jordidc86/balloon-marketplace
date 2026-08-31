import assert from 'node:assert/strict'

const commitPattern = /^[0-9a-f]{40}$/i
const terminalFailureStates = new Set(['error', 'failed', 'canceled', 'cancelled'])
const pendingStates = new Set(['new', 'pending', 'enqueued', 'building', 'uploading', 'uploaded', 'preparing', 'prepared', 'processing'])

export function parseNetlifyDeployList(output) {
  assert.equal(typeof output, 'string', 'Netlify deploy output must be text')
  const start = output.indexOf('[')
  const end = output.lastIndexOf(']')
  assert.ok(start >= 0 && end > start, 'Netlify did not return a deploy list')
  const deploys = JSON.parse(output.slice(start, end + 1))
  assert.ok(Array.isArray(deploys), 'Netlify deploy list is invalid')
  return deploys
}

export function classifyExactProductionDeploy(deploys, expectedCommit) {
  assert.match(expectedCommit, commitPattern, 'Expected production commit must be a full Git SHA')
  const matches = deploys.filter((deploy) =>
    deploy?.commit_ref === expectedCommit
    && deploy?.branch === 'production'
    && deploy?.context === 'production')
  assert.ok(matches.length <= 1, 'More than one production deploy exists for the exact release commit')
  if (matches.length === 0) return Object.freeze({ status: 'waiting', deploy: null })

  const deploy = matches[0]
  const state = String(deploy.state || '').toLowerCase()
  if (state === 'ready') {
    assert.ok(deploy.id && deploy.name && deploy.published_at, 'Ready deploy is missing immutable publication evidence')
    return Object.freeze({ status: 'ready', deploy })
  }
  if (terminalFailureStates.has(state)) {
    return Object.freeze({ status: 'failed', deploy })
  }
  assert.ok(pendingStates.has(state), `Unknown Netlify deploy state: ${state || 'missing'}`)
  return Object.freeze({ status: 'waiting', deploy })
}

export function buildProductionVerificationOrigins(deploy) {
  assert.match(String(deploy?.id || ''), /^[a-z0-9]+$/i, 'Netlify deploy id is invalid')
  assert.match(String(deploy?.name || ''), /^[a-z0-9-]+$/i, 'Netlify site name is invalid')
  const canonical = new URL(deploy.ssl_url || deploy.url)
  assert.equal(canonical.protocol, 'https:', 'Canonical production URL must use HTTPS')
  return Object.freeze({
    immutable: `https://${deploy.id}--${deploy.name}.netlify.app`,
    canonical: canonical.origin,
  })
}

export const productionEndpointContracts = Object.freeze([
  Object.freeze({ path: '/', contentType: 'text/html', marker: 'AeroTrade' }),
  Object.freeze({ path: '/catalog', contentType: 'text/html', marker: 'AeroTrade' }),
  Object.freeze({ path: '/feed.xml', contentType: 'xml', marker: '<rss' }),
  Object.freeze({ path: '/sitemap.xml', contentType: 'xml', marker: '<urlset' }),
  Object.freeze({ path: '/robots.txt', contentType: 'text/plain', marker: 'Sitemap:' }),
])

export function verifyPublicEndpointResponse({ contract, status, contentType, body }) {
  assert.equal(status, 200, `${contract.path} did not return HTTP 200`)
  assert.match(String(contentType || '').toLowerCase(), new RegExp(contract.contentType.replace('/', '\\/')), `${contract.path} returned the wrong content type`)
  assert.ok(String(body || '').includes(contract.marker), `${contract.path} is missing its release marker`)
  return Object.freeze({
    path: contract.path,
    status,
    contentType: String(contentType || '').split(';')[0].trim().toLowerCase(),
    markerVerified: true,
  })
}
