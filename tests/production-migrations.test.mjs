import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assessProductionMigrationState,
  assertProductionMigrationStateIsSafe,
  createProductionMigrationManifest,
  parseSupabaseMigrationList,
  validateAppendOnlyMigrationChanges,
  validateProductionMigrationMarker,
} from '../scripts/lib/production-migrations.mjs'

const entries = [
  { path: 'supabase/migrations/20260831000000_first.sql', contents: 'select 1;\n' },
  { path: 'supabase/migrations/20260831010000_second.sql', contents: 'select 2;\n' },
]

test('creates a deterministic content-bound migration manifest', () => {
  const first = createProductionMigrationManifest(entries)
  const second = createProductionMigrationManifest(entries)
  assert.equal(first.migrationManifestSha256, second.migrationManifestSha256)
  assert.equal(first.migrationCount, 2)
  assert.deepEqual(first.migrationVersions, ['20260831000000', '20260831010000'])

  const changed = createProductionMigrationManifest([
    entries[0],
    { ...entries[1], contents: 'select 3;\n' },
  ])
  assert.notEqual(first.migrationManifestSha256, changed.migrationManifestSha256)
})

test('rejects unordered or duplicate migration versions', () => {
  assert.throws(() => createProductionMigrationManifest(entries.toReversed()), /deterministic path order/)
  assert.throws(() => createProductionMigrationManifest([
    { path: 'supabase/migrations/20260831000000_duplicate.sql', contents: 'select 2;\n' },
    entries[0],
  ]), /versions must be unique/)
})

test('allows only newly added migration files in a production release', () => {
  assert.deepEqual(validateAppendOnlyMigrationChanges([
    { status: 'M', path: 'src/app/page.tsx' },
    { status: 'A', path: 'supabase/migrations/20260831000000_first.sql' },
  ]), ['supabase/migrations/20260831000000_first.sql'])
  assert.throws(() => validateAppendOnlyMigrationChanges([
    { status: 'M', path: 'supabase/migrations/20260831000000_first.sql' },
  ]), /append-only/)
  assert.throws(() => validateAppendOnlyMigrationChanges([
    { status: 'D', path: 'supabase/migrations/20260831000000_first.sql' },
  ]), /append-only/)
})

test('validates the exact release marker against migration contents', () => {
  const manifest = createProductionMigrationManifest(entries)
  assert.deepEqual(validateProductionMigrationMarker({
    provider: 'supabase',
    applyBeforeApplication: true,
    requiresExactConfirmation: true,
    migrationCount: 2,
    migrationVersions: ['20260831000000', '20260831010000'],
    migrationManifestSha256: manifest.migrationManifestSha256,
  }, manifest), {
    databaseProvider: 'supabase',
    databaseApplyBeforeApplication: true,
    databaseMigrationCount: 2,
    databaseMigrationVersions: ['20260831000000', '20260831010000'],
    databaseMigrationManifestSha256: manifest.migrationManifestSha256,
  })
})

test('parses the linked Supabase migration ledger', () => {
  const rows = parseSupabaseMigrationList('Connecting...\n{"migrations":[{"local":"20260831000000","remote":"20260831000000"},{"local":"20260831010000","remote":""}],"message":"ok"}')
  assert.deepEqual(rows, [
    { local: '20260831000000', remote: '20260831000000' },
    { local: '20260831010000', remote: '' },
  ])
})

test('allows only the migrations declared by the release to be pending before apply', () => {
  const state = assessProductionMigrationState({
    ledgerRows: [
      { local: '20260831000000', remote: '20260831000000' },
      { local: '20260831010000', remote: '' },
    ],
    repositoryVersions: ['20260831000000', '20260831010000'],
    requiredVersions: ['20260831010000'],
  })
  assert.deepEqual(state.requiredPendingVersions, ['20260831010000'])
  assert.equal(state.schemaReady, false)
  assert.doesNotThrow(() => assertProductionMigrationStateIsSafe(state, { allowRequiredPending: true }))
  assert.throws(
    () => assertProductionMigrationStateIsSafe(state, { allowRequiredPending: false }),
    /not applied in production/,
  )
})

test('blocks remote-only drift and undeclared pending history', () => {
  const remoteDrift = assessProductionMigrationState({
    ledgerRows: [
      { local: '20260831000000', remote: '20260831000000' },
      { local: '', remote: '20260831990000' },
    ],
    repositoryVersions: ['20260831000000'],
    requiredVersions: [],
  })
  assert.throws(
    () => assertProductionMigrationStateIsSafe(remoteDrift, { allowRequiredPending: true }),
    /absent from the candidate repository/,
  )

  const undeclaredPending = assessProductionMigrationState({
    ledgerRows: [
      { local: '20260831000000', remote: '' },
      { local: '20260831010000', remote: '' },
    ],
    repositoryVersions: ['20260831000000', '20260831010000'],
    requiredVersions: ['20260831010000'],
  })
  assert.throws(
    () => assertProductionMigrationStateIsSafe(undeclaredPending, { allowRequiredPending: true }),
    /outside the declared release manifest/,
  )
})

test('blocks a missing migration inserted behind the latest production version', () => {
  const state = assessProductionMigrationState({
    ledgerRows: [
      { local: '20260831000000', remote: '' },
      { local: '20260831010000', remote: '20260831010000' },
    ],
    repositoryVersions: ['20260831000000', '20260831010000'],
    requiredVersions: ['20260831000000'],
  })
  assert.deepEqual(state.outOfOrderPendingVersions, ['20260831000000'])
  assert.throws(
    () => assertProductionMigrationStateIsSafe(state, { allowRequiredPending: true }),
    /not newer than the latest remote migration/,
  )
})

test('proves schema readiness only after every repository migration is remote', () => {
  const state = assessProductionMigrationState({
    ledgerRows: [
      { local: '20260831000000', remote: '20260831000000' },
      { local: '20260831010000', remote: '20260831010000' },
    ],
    repositoryVersions: ['20260831000000', '20260831010000'],
    requiredVersions: ['20260831010000'],
  })
  assert.equal(state.schemaReady, true)
  assert.doesNotThrow(() => assertProductionMigrationStateIsSafe(state, { allowRequiredPending: false }))
})
