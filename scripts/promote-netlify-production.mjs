#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { validateProductionPromotion } from './lib/production-release.mjs'
import {
  assessProductionMigrationState,
  assertProductionMigrationStateIsSafe,
  createProductionMigrationManifest,
  parseSupabaseMigrationList,
  validateAppendOnlyMigrationChanges,
} from './lib/production-migrations.mjs'

const supabaseCliVersion = '2.116.0'
let databaseMutationAttempted = false
let databaseMutationVerified = false
let productionBranchUpdated = false
let netlifyDeploysRequested = 0

process.on('uncaughtException', (error) => {
  console.error(JSON.stringify({
    kind: 'aerotrade_netlify_production_promotion',
    containsPii: false,
    result: 'blocked',
    reason: error instanceof Error ? error.message : 'Unknown production promotion failure',
    productionBranchUpdated,
    netlifyDeploysRequested,
    databaseMutationAttempted,
    databaseMutationVerified,
  }, null, 2))
  process.exit(1)
})

const apply = process.argv.includes('--apply')
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--apply')
assert.deepEqual(unknownArguments, [], `Unknown argument(s): ${unknownArguments.join(', ')}`)

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    maxBuffer: 32 * 1024 * 1024,
  })
  const allowedStatuses = options.allowedStatuses ?? [0]
  if (!allowedStatuses.includes(result.status)) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `:\n${detail}` : ''}`)
  }
  return result
}

function git(args) {
  return run('git', args).stdout.trim()
}

function listProductionMigrations() {
  const result = run('npx', [
    '--yes', `supabase@${supabaseCliVersion}`, 'migration', 'list', '--linked', '--workdir', '.',
  ])
  return parseSupabaseMigrationList(result.stdout)
}

function productionEnvironmentValue(name) {
  const existing = String(process.env[name] || '').trim()
  if (existing) return existing
  const output = run('netlify', ['env:get', name, '--context', 'production']).stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const value = output.at(-1) || ''
  assert.ok(value, `Production environment value ${name} is unavailable`)
  return value
}

function verifyBackwardCompatibility() {
  const result = run(process.execPath, ['scripts/verify-release-backward-compatibility.mjs', '--require-live'], {
    env: {
      NEXT_PUBLIC_SUPABASE_URL: productionEnvironmentValue('NEXT_PUBLIC_SUPABASE_URL'),
      SUPABASE_SERVICE_ROLE_KEY: productionEnvironmentValue('SUPABASE_SERVICE_ROLE_KEY'),
    },
  })
  const receipt = JSON.parse(result.stdout)
  assert.equal(receipt.productionMutated, false, 'Backward compatibility verification must be read-only')
  assert.equal(receipt.liveData?.checked, true, 'Backward compatibility verification did not inspect live production vocabularies')
  assert.equal(receipt.destructiveDdl?.hardDestructiveOperations, 0, 'Release contains hard destructive DDL')
  assert.equal(receipt.buyerFunction?.stable, true, 'Deployed buyer negotiation function contract is not stable')
  return receipt
}

function output(receipt) {
  console.log(JSON.stringify({
    kind: 'aerotrade_netlify_production_promotion',
    containsPii: false,
    ...receipt,
  }, null, 2))
}

git(['fetch', '--quiet', 'origin', 'main', 'production'])
assert.equal(git(['status', '--porcelain']), '', 'Worktree must be clean before a production promotion')

const productionCommit = git(['rev-parse', 'origin/production'])
const candidateCommit = git(['rev-parse', 'origin/main'])
assert.equal(git(['rev-parse', 'HEAD']), candidateCommit, 'Release verification requires the checked-out HEAD to equal origin/main exactly')
const mergeBaseCommit = git(['merge-base', productionCommit, candidateCommit])
const changedFiles = git(['diff', '--name-only', productionCommit, candidateCommit]).split(/\r?\n/).filter(Boolean)
const migrationChanges = git(['diff', '--name-status', '--no-renames', productionCommit, candidateCommit])
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const [status, ...pathParts] = line.split(/\t/)
    return { status, path: pathParts.join('\t') }
  })
const migrationFiles = validateAppendOnlyMigrationChanges(migrationChanges)
const migrationManifest = createProductionMigrationManifest(migrationFiles.map((path) => ({
  path,
  contents: run('git', ['show', `${candidateCommit}:${path}`]).stdout,
})))
const repositoryMigrationVersions = git(['ls-tree', '-r', '--name-only', candidateCommit, 'supabase/migrations'])
  .split(/\r?\n/)
  .map((path) => /^supabase\/migrations\/([0-9]{14})_[a-z0-9_]+\.sql$/.exec(path)?.[1] || null)
  .filter(Boolean)
  .toSorted()
const markerText = git(['show', `${candidateCommit}:release/netlify-production.json`])
const marker = JSON.parse(markerText)
const gate = run(process.execPath, ['scripts/netlify-ignore-build.mjs'], {
  env: { CACHED_COMMIT_REF: productionCommit, COMMIT_REF: candidateCommit },
  allowedStatuses: [0, 1],
})

const validation = validateProductionPromotion({
  productionCommit,
  candidateCommit,
  mergeBaseCommit,
  marker,
  changedFiles,
  gateStatus: gate.status,
  gateOutput: gate.stdout,
  migrationManifest,
})
const backwardCompatibility = verifyBackwardCompatibility()
assert.equal(backwardCompatibility.baseCommit, productionCommit, 'Backward compatibility proof targets another production commit')
assert.equal(backwardCompatibility.candidateCommit, candidateCommit, 'Backward compatibility proof targets another candidate commit')
const migrationStateBefore = assessProductionMigrationState({
  ledgerRows: listProductionMigrations(),
  repositoryVersions: repositoryMigrationVersions,
  requiredVersions: migrationManifest.migrationVersions,
})
assertProductionMigrationStateIsSafe(migrationStateBefore, { allowRequiredPending: true })

if (!apply) {
  output({
    mode: 'dry_run',
    result: migrationStateBefore.requiredPendingVersions.length > 0
      ? 'ready_for_explicit_database_and_production_promotion'
      : 'ready_for_explicit_production_promotion',
    productionBranchUpdated: false,
    netlifyDeploysRequested: 0,
    databaseMutated: false,
    pendingDatabaseMigrations: migrationStateBefore.requiredPendingVersions,
    remoteLatestMigration: migrationStateBefore.remoteLatestVersion,
    backwardCompatibilityVerified: true,
    liveCompatibilityRowsChecked:
      backwardCompatibility.liveData.notificationTypes.rowCount
      + backwardCompatibility.liveData.sellerStages.rowCount,
    ...validation,
  })
  process.exit(0)
}

assert.equal(
  process.env.CONFIRM_AEROTRADE_PRODUCTION_RELEASE,
  marker.releaseId,
  'Set CONFIRM_AEROTRADE_PRODUCTION_RELEASE to the exact releaseId before using --apply',
)
assert.equal(
  process.env.CONFIRM_AEROTRADE_DATABASE_MIGRATIONS,
  migrationManifest.migrationManifestSha256,
  'Set CONFIRM_AEROTRADE_DATABASE_MIGRATIONS to the exact migration manifest SHA-256 before using --apply',
)
run('npm', ['run', 'verify:production-release'])
if (migrationStateBefore.requiredPendingVersions.length > 0) {
  databaseMutationAttempted = true
  run('npx', [
    '--yes', `supabase@${supabaseCliVersion}`, 'db', 'push', '--linked', '--include-all', '--yes', '--workdir', '.',
  ])
}
const migrationStateAfter = assessProductionMigrationState({
  ledgerRows: listProductionMigrations(),
  repositoryVersions: repositoryMigrationVersions,
  requiredVersions: migrationManifest.migrationVersions,
})
assertProductionMigrationStateIsSafe(migrationStateAfter, { allowRequiredPending: false })
databaseMutationVerified = true
run('git', ['push', '--porcelain', 'origin', `${candidateCommit}:refs/heads/production`])
productionBranchUpdated = true
netlifyDeploysRequested = 1
const remoteProductionCommit = git(['ls-remote', '--heads', 'origin', 'refs/heads/production']).split(/\s+/)[0]
assert.equal(remoteProductionCommit, candidateCommit, 'Remote production branch did not persist the promoted commit')

output({
  mode: 'apply',
  result: 'production_branch_promoted',
  productionBranchUpdated: true,
  netlifyDeploysRequested: 1,
  databaseMutated: migrationStateBefore.requiredPendingVersions.length > 0,
  databaseMigrationsApplied: migrationStateBefore.requiredPendingVersions,
  remoteLatestMigration: migrationStateAfter.remoteLatestVersion,
  backwardCompatibilityVerified: true,
  liveCompatibilityRowsChecked:
    backwardCompatibility.liveData.notificationTypes.rowCount
    + backwardCompatibility.liveData.sellerStages.rowCount,
  ...validation,
  remoteProductionCommit,
})
