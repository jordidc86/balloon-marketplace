import assert from 'node:assert/strict'
import test from 'node:test'
import { validateProductionPromotion } from '../scripts/lib/production-release.mjs'
import { createProductionMigrationManifest } from '../scripts/lib/production-migrations.mjs'

const productionCommit = '1'.repeat(40)
const candidateCommit = '2'.repeat(40)
const migrationManifest = createProductionMigrationManifest([
  {
    path: 'supabase/migrations/20260831000000_first.sql',
    contents: 'select 1;\n',
  },
])

function validInput() {
  return {
    productionCommit,
    candidateCommit,
    mergeBaseCommit: productionCommit,
    marker: {
      schemaVersion: 2,
      releaseId: '2026-08-31-consolidated-release',
      productionBaseCommit: productionCommit,
      expectedProductionDeploys: 1,
      requiresExplicitApproval: true,
      database: {
        provider: 'supabase',
        applyBeforeApplication: true,
        requiresExactConfirmation: true,
        migrationCount: migrationManifest.migrationCount,
        migrationVersions: migrationManifest.migrationVersions,
        migrationManifestSha256: migrationManifest.migrationManifestSha256,
      },
    },
    changedFiles: ['src/app/page.tsx', 'supabase/migrations/20260831000000_first.sql', 'release/netlify-production.json'],
    gateStatus: 1,
    gateOutput: 'Netlify build gate: explicit production release marker changed; building 1 runtime-relevant change(s).',
    migrationManifest,
  }
}

test('accepts one explicitly marked fast-forward production release', () => {
  assert.deepEqual(validateProductionPromotion(validInput()), {
    productionCommit,
    candidateCommit,
    releaseId: '2026-08-31-consolidated-release',
    changedFileCount: 3,
    expectedProductionDeploys: 1,
    databaseProvider: 'supabase',
    databaseApplyBeforeApplication: true,
    databaseMigrationCount: 1,
    databaseMigrationVersions: ['20260831000000'],
    databaseMigrationManifestSha256: migrationManifest.migrationManifestSha256,
  })
})

test('rejects a stale release marker', () => {
  const input = validInput()
  input.marker.productionBaseCommit = '3'.repeat(40)
  assert.throws(() => validateProductionPromotion(input), /does not target the current production commit/)
})

test('rejects a non-fast-forward candidate', () => {
  const input = validInput()
  input.mergeBaseCommit = '3'.repeat(40)
  assert.throws(() => validateProductionPromotion(input), /fast-forward descendant/)
})

test('rejects a candidate without the explicit release marker', () => {
  const input = validInput()
  input.changedFiles = ['src/app/page.tsx']
  assert.throws(() => validateProductionPromotion(input), /does not change the production release marker/)
})

test('rejects multiple expected production deploys', () => {
  const input = validInput()
  input.marker.expectedProductionDeploys = 2
  assert.throws(() => validateProductionPromotion(input), /exactly one production deploy/)
})

test('rejects promotion without an explicit approval requirement', () => {
  const input = validInput()
  input.marker.requiresExplicitApproval = false
  assert.throws(() => validateProductionPromotion(input), /explicit approval requirement/)
})

test('rejects a release marker with a stale migration fingerprint', () => {
  const input = validInput()
  input.marker.database.migrationManifestSha256 = '0'.repeat(64)
  assert.throws(() => validateProductionPromotion(input), /does not match candidate contents/)
})

test('rejects application-first database sequencing', () => {
  const input = validInput()
  input.marker.database.applyBeforeApplication = false
  assert.throws(() => validateProductionPromotion(input), /must be applied before application promotion/)
})
