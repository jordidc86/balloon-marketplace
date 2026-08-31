import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const migrationPathPattern = /^supabase\/migrations\/([0-9]{14})_[a-z0-9_]+\.sql$/
const sha256Pattern = /^[0-9a-f]{64}$/

export function validateAppendOnlyMigrationChanges(changes) {
  assert.ok(Array.isArray(changes), 'Migration changes must be an array')
  const migrationChanges = changes.filter((change) => migrationPathPattern.test(change?.path || ''))
  for (const change of migrationChanges) {
    assert.equal(change.status, 'A', `Production migrations are append-only; ${change.path} is ${change.status}`)
  }
  const paths = migrationChanges.map((change) => change.path).toSorted()
  assert.equal(new Set(paths).size, paths.length, 'Production migration changes must be unique')
  return Object.freeze(paths)
}

export function createProductionMigrationManifest(entries) {
  assert.ok(Array.isArray(entries), 'Migration manifest entries must be an array')

  const migrations = entries.map((entry) => {
    assert.equal(typeof entry?.path, 'string', 'Migration path is required')
    const match = migrationPathPattern.exec(entry.path)
    assert.ok(match, `Invalid production migration path: ${entry.path}`)
    assert.equal(typeof entry?.contents, 'string', `Migration contents are required for ${entry.path}`)
    return {
      path: entry.path,
      version: match[1],
      sha256: createHash('sha256').update(entry.contents, 'utf8').digest('hex'),
    }
  })

  const sortedPaths = migrations.map((migration) => migration.path).toSorted()
  assert.deepEqual(
    migrations.map((migration) => migration.path),
    sortedPaths,
    'Production migrations must be supplied in deterministic path order',
  )
  assert.equal(new Set(migrations.map((migration) => migration.version)).size, migrations.length, 'Migration versions must be unique')

  const canonical = JSON.stringify({
    schemaVersion: 1,
    migrations: migrations.map(({ path, version, sha256 }) => ({ path, version, sha256 })),
  })

  return Object.freeze({
    schemaVersion: 1,
    migrationCount: migrations.length,
    migrationVersions: Object.freeze(migrations.map((migration) => migration.version)),
    migrationManifestSha256: createHash('sha256').update(canonical, 'utf8').digest('hex'),
    migrations: Object.freeze(migrations),
  })
}

export function validateProductionMigrationMarker(database, manifest) {
  assert.equal(database?.provider, 'supabase', 'Production database provider must be Supabase')
  assert.equal(database?.applyBeforeApplication, true, 'Database migrations must be applied before application promotion')
  assert.equal(database?.requiresExactConfirmation, true, 'Database migrations must retain an exact confirmation requirement')
  assert.equal(database?.migrationCount, manifest.migrationCount, 'Release marker migration count does not match candidate')
  assert.deepEqual(database?.migrationVersions, manifest.migrationVersions, 'Release marker migration versions do not match candidate')
  assert.match(database?.migrationManifestSha256 ?? '', sha256Pattern, 'Release marker migration manifest SHA-256 is invalid')
  assert.equal(
    database.migrationManifestSha256,
    manifest.migrationManifestSha256,
    'Release marker migration manifest SHA-256 does not match candidate contents',
  )

  return Object.freeze({
    databaseProvider: database.provider,
    databaseApplyBeforeApplication: true,
    databaseMigrationCount: manifest.migrationCount,
    databaseMigrationVersions: manifest.migrationVersions,
    databaseMigrationManifestSha256: manifest.migrationManifestSha256,
  })
}

export function parseSupabaseMigrationList(output) {
  assert.equal(typeof output, 'string', 'Supabase migration list output must be text')
  const start = output.lastIndexOf('{"migrations"')
  assert.ok(start >= 0, 'Supabase migration list did not return structured JSON')
  const parsed = JSON.parse(output.slice(start).trim())
  assert.ok(Array.isArray(parsed.migrations), 'Supabase migration list is missing migrations')

  return parsed.migrations.map((row) => {
    const local = String(row?.local || '').trim()
    const remote = String(row?.remote || '').trim()
    if (local) assert.match(local, /^[0-9]{14}$/, `Invalid local migration version: ${local}`)
    if (remote) assert.match(remote, /^[0-9]{14}$/, `Invalid remote migration version: ${remote}`)
    assert.ok(local || remote, 'Migration ledger row must contain a local or remote version')
    return Object.freeze({ local, remote })
  })
}

export function assessProductionMigrationState({ ledgerRows, repositoryVersions, requiredVersions }) {
  assert.ok(Array.isArray(ledgerRows), 'Migration ledger rows are required')
  assert.ok(Array.isArray(repositoryVersions), 'Repository migration versions are required')
  assert.ok(Array.isArray(requiredVersions), 'Required migration versions are required')

  for (const version of [...repositoryVersions, ...requiredVersions]) assert.match(version, /^[0-9]{14}$/)
  assert.equal(new Set(repositoryVersions).size, repositoryVersions.length, 'Repository migration versions must be unique')
  assert.equal(new Set(requiredVersions).size, requiredVersions.length, 'Required migration versions must be unique')

  const repository = new Set(repositoryVersions)
  const remote = new Set(ledgerRows.map((row) => row.remote).filter(Boolean))
  const remoteOnlyVersions = [...remote].filter((version) => !repository.has(version)).toSorted()
  const repositoryPendingVersions = repositoryVersions.filter((version) => !remote.has(version))
  const requiredPendingVersions = requiredVersions.filter((version) => !remote.has(version))
  const unexpectedPendingVersions = repositoryPendingVersions.filter((version) => !requiredVersions.includes(version))
  const remoteLatestVersion = [...remote].toSorted().at(-1) || null
  const outOfOrderPendingVersions = remoteLatestVersion
    ? requiredPendingVersions.filter((version) => version <= remoteLatestVersion)
    : []

  return Object.freeze({
    remoteAppliedCount: remote.size,
    remoteLatestVersion,
    remoteOnlyVersions: Object.freeze(remoteOnlyVersions),
    repositoryPendingVersions: Object.freeze(repositoryPendingVersions),
    requiredPendingVersions: Object.freeze(requiredPendingVersions),
    unexpectedPendingVersions: Object.freeze(unexpectedPendingVersions),
    outOfOrderPendingVersions: Object.freeze(outOfOrderPendingVersions),
    schemaReady: remoteOnlyVersions.length === 0
      && repositoryPendingVersions.length === 0
      && requiredPendingVersions.length === 0,
  })
}

export function assertProductionMigrationStateIsSafe(state, { allowRequiredPending }) {
  assert.deepEqual(state.remoteOnlyVersions, [], 'Remote migration ledger contains versions absent from the candidate repository')
  assert.deepEqual(state.unexpectedPendingVersions, [], 'Production is missing migrations outside the declared release manifest')
  assert.deepEqual(state.outOfOrderPendingVersions, [], 'A pending release migration is not newer than the latest remote migration')
  if (!allowRequiredPending) {
    assert.deepEqual(state.requiredPendingVersions, [], 'Declared release migrations are not applied in production')
    assert.equal(state.schemaReady, true, 'Production schema is not ready for application promotion')
  }
  return state
}
