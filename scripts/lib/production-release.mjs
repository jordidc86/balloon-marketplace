import assert from 'node:assert/strict'

const commitPattern = /^[0-9a-f]{40}$/i

export function validateProductionPromotion({
  productionCommit,
  candidateCommit,
  mergeBaseCommit,
  marker,
  changedFiles,
  gateStatus,
  gateOutput,
}) {
  assert.match(productionCommit, commitPattern, 'Production commit must be a full Git SHA')
  assert.match(candidateCommit, commitPattern, 'Candidate commit must be a full Git SHA')
  assert.notEqual(candidateCommit, productionCommit, 'Production already points at the candidate commit')
  assert.equal(mergeBaseCommit, productionCommit, 'Candidate must be a fast-forward descendant of production')

  assert.equal(marker?.schemaVersion, 1, 'Unsupported production release marker schema')
  assert.equal(marker?.productionBaseCommit, productionCommit, 'Release marker does not target the current production commit')
  assert.equal(marker?.expectedProductionDeploys, 1, 'A release must request exactly one production deploy')
  assert.equal(marker?.requiresExplicitApproval, true, 'A release must retain the explicit approval requirement')
  assert.match(marker?.releaseId ?? '', /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]+$/, 'Release ID must be dated and machine-readable')

  assert.ok(Array.isArray(changedFiles) && changedFiles.length > 0, 'Candidate contains no changes')
  assert.ok(changedFiles.includes('release/netlify-production.json'), 'Candidate does not change the production release marker')
  assert.equal(gateStatus, 1, 'Netlify gate must request one explicit build for the candidate')
  assert.match(gateOutput, /explicit production release marker changed/, 'Netlify gate did not recognize the explicit release marker')

  return Object.freeze({
    productionCommit,
    candidateCommit,
    releaseId: marker.releaseId,
    changedFileCount: changedFiles.length,
    expectedProductionDeploys: 1,
  })
}
