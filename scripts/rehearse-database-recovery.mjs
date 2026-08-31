#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { rehearseMarketplaceTransaction } from './lib/marketplace-transaction-rehearsal.mjs'
import { rehearseNewBalloonTransaction } from './lib/new-balloon-transaction-rehearsal.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const recoveryDir = join(root, 'supabase', 'recovery')
const migrationsDir = join(root, 'supabase', 'migrations')
const manifestPath = join(recoveryDir, 'manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const cliVersion = '2.116.0'
const tempPrefix = join(tmpdir(), 'aerotrade-db-recovery-')
const excludedServices = 'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'

const localEnv = { ...process.env }
for (const key of [
  'DATABASE_URL',
  'DIRECT_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_PROJECT_REF',
  'SUPABASE_SERVICE_ROLE_KEY',
]) delete localEnv[key]

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: localEnv,
    encoding: 'utf8',
    input: options.input,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0 && !options.allowFailure) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `:\n${detail}` : ''}`)
  }
  return result
}

function runDatabaseSql(containerName, sql) {
  return run('docker', [
    'exec', '-i', containerName,
    'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
  ], { input: sql })
}

function migrationVersion(file) {
  return /^([0-9]{14})_.+\.sql$/.exec(file)?.[1] || null
}

function assertSameList(actual, expected, label) {
  assert.deepEqual(actual, expected, `${label} differs from the recovery manifest`)
}

function parseLint(output) {
  const jsonLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .findLast((line) => line.startsWith('{"results"'))
  assert.ok(jsonLine, 'Supabase lint did not return structured results')
  return JSON.parse(jsonLine)
}

assert.equal(manifest.schemaVersion, 1)
assert.equal(manifest.kind, 'shared_public_schema_recovery_baseline')
assert.match(manifest.baselineMigration, /^[0-9]{14}$/)
assert.match(manifest.snapshot, /^[0-9]{14}_[a-z0-9_]+\.sql$/)
assert.equal(manifest.containsTableRows, false)
assert.equal(manifest.containsCredentials, false)
assert.equal(manifest.sharedSchema, true)
assert.ok(Array.isArray(manifest.historicalMigrationsSatisfiedBySnapshot))

const snapshotPath = join(recoveryDir, manifest.snapshot)
assert.ok(existsSync(snapshotPath), 'Recovery snapshot is missing')
const snapshot = readFileSync(snapshotPath)
const snapshotText = snapshot.toString('utf8')
const snapshotSha256 = createHash('sha256').update(snapshot).digest('hex')
assert.equal(snapshotSha256, manifest.snapshotSha256, 'Recovery snapshot checksum mismatch')
// Schema-only dumps legitimately contain INSERT statements inside stored procedure
// bodies. pg_dump marks actual table-data sections explicitly and emits COPY FROM
// stdin or sequence setval statements outside those function bodies.
assert.ok(!/^-- Data for Name:/m.test(snapshotText), 'Recovery snapshot unexpectedly contains a table-data section')
assert.ok(!/^COPY\s+[^\n]+\s+FROM\s+stdin;\s*$/im.test(snapshotText), 'Recovery snapshot unexpectedly contains copied table rows')
assert.ok(!/^SELECT\s+pg_catalog\.setval\(/im.test(snapshotText), 'Recovery snapshot unexpectedly contains sequence row state')
assert.ok(!/postgres(?:ql)?:\/\//i.test(snapshotText), 'Recovery snapshot unexpectedly contains a database URL')
assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(snapshotText), 'Recovery snapshot unexpectedly contains a JWT-like value')

const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => migrationVersion(file))
  .sort()
const repositoryVersions = migrationFiles.map(migrationVersion)
const historicalVersions = repositoryVersions.filter((version) => version <= manifest.baselineMigration)
const forwardFiles = migrationFiles.filter((file) => migrationVersion(file) > manifest.baselineMigration)
const declaredHistoricalVersions = [
  ...manifest.appliedHistory,
  ...manifest.historicalMigrationsSatisfiedBySnapshot,
].sort()
assertSameList(historicalVersions, declaredHistoricalVersions, 'Historical migration coverage')
assert.equal(
  new Set(declaredHistoricalVersions).size,
  declaredHistoricalVersions.length,
  'Historical migration declarations overlap',
)
assert.ok(forwardFiles.length > 0, 'No forward migrations were found after the recovery baseline')

const tempRoot = mkdtempSync(tempPrefix)
const projectId = basename(tempRoot)
const tempMigrations = join(tempRoot, 'supabase', 'migrations')
const containerName = `supabase_db_${projectId}`
let started = false

try {
  run('npx', ['--yes', `supabase@${cliVersion}`, 'init', '--force'], { cwd: tempRoot })
  mkdirSync(tempMigrations, { recursive: true })
  copyFileSync(snapshotPath, join(tempMigrations, `${manifest.baselineMigration}_production_public_baseline.sql`))
  for (const file of forwardFiles) copyFileSync(join(migrationsDir, file), join(tempMigrations, file))

  run('npx', [
    '--yes', `supabase@${cliVersion}`, 'start',
    '--workdir', tempRoot,
    '--exclude', excludedServices,
  ])
  started = true

  const historyBeforeBaseline = historicalVersions.filter((version) => version !== manifest.baselineMigration)
  for (const version of historyBeforeBaseline) {
    writeFileSync(
      join(tempMigrations, `${version}_satisfied_by_recovery_snapshot.sql`),
      `-- Schema effect satisfied by checksummed recovery baseline ${manifest.baselineMigration}.\n`,
      'utf8',
    )
  }
  run('npx', [
    '--yes', `supabase@${cliVersion}`, 'migration', 'repair',
    '--local', '--status', 'applied', '--yes', '--workdir', tempRoot,
    ...historyBeforeBaseline,
  ])

  const history = run('docker', [
    'exec', containerName, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-At', '-v', 'ON_ERROR_STOP=1',
    '-c', 'select version from supabase_migrations.schema_migrations order by version;',
  ]).stdout.trim().split(/\r?\n/).filter(Boolean)
  assertSameList(history, repositoryVersions, 'Recovered migration history')

  const integrity = run('docker', [
    'exec', containerName, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-At', '-v', 'ON_ERROR_STOP=1',
    '-c', [
      "select json_build_object(",
      "  'public_tables', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),",
      "  'public_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),",
      "  'rls_tables', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity),",
      "  'latest_migration', (select max(version) from supabase_migrations.schema_migrations),",
      "  'social_receipts_rls', (select relrowsecurity from pg_class where oid='public.social_publication_receipts'::regclass),",
      "  'availability_named_conflict', (select bool_and(position('on conflict on constraint listing_availability_confirmations_listing_id_confirmed_on_key do nothing' in lower(pg_get_functiondef(p.oid))) > 0) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('confirm_listing_availability','confirm_all_listing_availability','confirm_listing_availability_from_seller_digest'))",
      ")::text;",
    ].join(' '),
  ]).stdout.trim()
  const integrityResult = JSON.parse(integrity)
  assert.equal(integrityResult.latest_migration, repositoryVersions.at(-1))
  assert.equal(integrityResult.social_receipts_rls, true)
  assert.equal(integrityResult.availability_named_conflict, true)
  assert.ok(integrityResult.public_tables >= 50)
  assert.ok(integrityResult.public_functions >= 25)
  assert.ok(integrityResult.rls_tables >= 20)

  const transactionRehearsal = rehearseMarketplaceTransaction(
    (sql) => runDatabaseSql(containerName, sql),
  )
  const newBalloonTransactionRehearsal = rehearseNewBalloonTransaction(
    (sql) => runDatabaseSql(containerName, sql),
  )

  const lintRun = run('npx', [
    '--yes', `supabase@${cliVersion}`, 'db', 'lint',
    '--local', '--level', 'error', '--workdir', tempRoot,
  ], { allowFailure: true })
  const lint = parseLint([lintRun.stdout, lintRun.stderr].filter(Boolean).join('\n'))
  const lintIssues = lint.results.flatMap((result) =>
    result.issues.map((issue) => ({ function: result.function, sqlState: issue.sqlState, message: issue.message })))
  assert.deepEqual(lintIssues, [{
    function: 'public.vb_redeem_open_gift_internal_v1',
    sqlState: '42804',
    message: 'structure of query does not match function result type',
  }], 'Recovery schema has an unexpected lint error')

  console.log(JSON.stringify({
    kind: 'aerotrade_database_recovery_rehearsal',
    containsPii: false,
    productionAccessed: false,
    productionMutated: false,
    snapshotSha256,
    baselineMigration: manifest.baselineMigration,
    latestMigration: repositoryVersions.at(-1),
    migrationsVerified: repositoryVersions.length,
    forwardMigrationsApplied: forwardFiles.length,
    publicTables: integrityResult.public_tables,
    publicFunctions: integrityResult.public_functions,
    rlsTables: integrityResult.rls_tables,
    transactionRehearsal,
    newBalloonTransactionRehearsal,
    aerotradeLintErrors: 0,
    knownSharedVoyagerLintErrors: lintIssues.length,
  }, null, 2))
} finally {
  if (started) run('npx', [
    '--yes', `supabase@${cliVersion}`, 'stop',
    '--no-backup', '--workdir', tempRoot,
  ], { allowFailure: true })
  assert.ok(tempRoot.startsWith(tempPrefix), 'Refusing to remove an unexpected recovery path')
  rmSync(tempRoot, { recursive: true, force: true })
}
