#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import {
  buildProductionVerificationOrigins,
  classifyExactProductionDeploy,
  parseNetlifyDeployList,
  productionEndpointContracts,
  verifyPublicEndpointResponse,
} from './lib/production-live-verification.mjs'

const expectedCommit = String(process.env.EXPECTED_PRODUCTION_COMMIT || '').trim()
const expectedReleaseId = String(process.env.EXPECTED_RELEASE_ID || '').trim()
assert.match(expectedCommit, /^[0-9a-f]{40}$/i, 'EXPECTED_PRODUCTION_COMMIT must be a full Git SHA')
assert.match(expectedReleaseId, /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]+$/, 'EXPECTED_RELEASE_ID is invalid')

const state = JSON.parse(readFileSync('.netlify/state.json', 'utf8'))
const siteId = String(state.siteId || '').trim()
assert.match(siteId, /^[0-9a-f-]{36}$/i, 'Linked Netlify site id is invalid')

const timeoutMs = Number(process.env.AEROTRADE_DEPLOY_WAIT_MS || 600000)
const pollMs = Number(process.env.AEROTRADE_DEPLOY_POLL_MS || 5000)
assert.ok(Number.isInteger(timeoutMs) && timeoutMs >= 30000 && timeoutMs <= 900000, 'Deploy wait timeout is outside the safe range')
assert.ok(Number.isInteger(pollMs) && pollMs >= 1000 && pollMs <= 30000, 'Deploy poll interval is outside the safe range')

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function listDeploys() {
  const output = execFileSync('netlify', [
    'api', 'listSiteDeploys', '--data', JSON.stringify({ site_id: siteId, per_page: 50 }),
  ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  return parseNetlifyDeployList(output)
}

async function waitForExactDeploy() {
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    const classification = classifyExactProductionDeploy(listDeploys(), expectedCommit)
    if (classification.status === 'ready') return classification.deploy
    if (classification.status === 'failed') {
      throw new Error(`Exact Netlify production deploy ended in ${classification.deploy.state}`)
    }
    await delay(pollMs)
  }
  throw new Error('Timed out waiting for the exact Netlify production deploy')
}

async function verifyOrigin(origin) {
  const results = []
  for (const contract of productionEndpointContracts) {
    const url = new URL(contract.path, origin)
    url.searchParams.set('release_verification', expectedCommit.slice(0, 12))
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { accept: contract.contentType === 'text/html' ? 'text/html' : '*/*', 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(20000),
    })
    const body = await response.text()
    results.push(verifyPublicEndpointResponse({
      contract,
      status: response.status,
      contentType: response.headers.get('content-type'),
      body,
    }))
  }
  return results
}

async function verifyOriginWithRetry(origin) {
  const deadline = Date.now() + Math.min(timeoutMs, 120000)
  let lastError
  while (Date.now() <= deadline) {
    try {
      return await verifyOrigin(origin)
    } catch (error) {
      lastError = error
      await delay(pollMs)
    }
  }
  throw lastError || new Error(`Public verification timed out for ${origin}`)
}

const deploy = await waitForExactDeploy()
const origins = buildProductionVerificationOrigins(deploy)
const immutableChecks = await verifyOriginWithRetry(origins.immutable)
const canonicalChecks = await verifyOriginWithRetry(origins.canonical)

console.log(JSON.stringify({
  kind: 'aerotrade_production_live_release_verification',
  containsPii: false,
  releaseId: expectedReleaseId,
  expectedCommit,
  deployId: deploy.id,
  deployState: deploy.state,
  deployPublishedAt: deploy.published_at,
  exactDeployCount: 1,
  immutableOriginVerified: true,
  canonicalOriginVerified: true,
  immutableChecks,
  canonicalChecks,
  externalMessagesSent: 0,
  economicActionsPerformed: 0,
}, null, 2))
