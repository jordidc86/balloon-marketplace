#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  assertNoHardDestructiveDdl,
  assertSellerFunnelCompatibility,
  assertStableFunctionContract,
  assertVocabularyExpansion,
  extractConstraintVocabulary,
  extractFunctionContract,
  validateLiveVocabulary,
} from './lib/release-backward-compatibility.mjs'

const requireLive = process.argv.includes('--require-live')
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--require-live')
assert.deepEqual(unknownArguments, [], `Unknown argument(s): ${unknownArguments.join(', ')}`)

const marker = JSON.parse(readFileSync('release/netlify-production.json', 'utf8'))
const baseCommit = marker.productionBaseCommit
const candidateCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
}

function migrationFiles(commit) {
  return git(['ls-tree', '-r', '--name-only', commit, 'supabase/migrations'])
    .split(/\r?\n/)
    .filter((path) => /^supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/.test(path))
    .toSorted()
}

function migrationContents(commit) {
  return migrationFiles(commit).map((path) => ({ path, sql: git(['show', `${commit}:${path}`]) }))
}

function latestSqlContaining(migrations, needle) {
  const match = migrations.filter((migration) => migration.sql.includes(needle)).at(-1)
  assert.ok(match, `No migration contains ${needle}`)
  return match.sql
}

async function readObservedValues(client, table, column) {
  const counts = new Map()
  let offset = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await client.from(table).select(column).range(offset, offset + pageSize - 1)
    if (error) throw new Error(`${table}.${column} live compatibility read failed: ${error.message}`)
    for (const row of data || []) counts.set(row[column], (counts.get(row[column]) || 0) + 1)
    if (!data || data.length < pageSize) break
    offset += pageSize
    assert.ok(offset <= 100000, `${table}.${column} exceeds the bounded compatibility audit`)
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .toSorted((a, b) => String(a.value).localeCompare(String(b.value)))
}

const baseMigrations = migrationContents(baseCommit)
const candidateMigrations = migrationContents(candidateCommit)
const changedMigrationVersions = marker.database.migrationVersions
const changedMigrations = candidateMigrations.filter((migration) => changedMigrationVersions.includes(/^supabase\/migrations\/([0-9]{14})_/.exec(migration.path)?.[1]))
assert.equal(changedMigrations.length, changedMigrationVersions.length, 'Release compatibility scope does not match the release migration manifest')

const notificationConstraintName = 'commercial_notification_receipts_notification_type_check'
const sellerStageConstraintName = 'seller_funnel_events_stage_check'
const buyerFunctionName = 'record_buyer_inquiry_response'

const baseNotificationTypes = extractConstraintVocabulary(
  latestSqlContaining(baseMigrations, `add constraint ${notificationConstraintName}`),
  notificationConstraintName,
  'notification_type',
)
const candidateNotificationTypes = extractConstraintVocabulary(
  latestSqlContaining(candidateMigrations, `add constraint ${notificationConstraintName}`),
  notificationConstraintName,
  'notification_type',
)
const baseSellerStages = extractConstraintVocabulary(
  latestSqlContaining(baseMigrations, `add constraint ${sellerStageConstraintName}`),
  sellerStageConstraintName,
  'stage',
)
const candidateSellerStageSql = latestSqlContaining(candidateMigrations, `add constraint ${sellerStageConstraintName}`)
const candidateSellerStages = extractConstraintVocabulary(candidateSellerStageSql, sellerStageConstraintName, 'stage')

const notificationVocabulary = assertVocabularyExpansion({
  name: notificationConstraintName,
  baseValues: baseNotificationTypes,
  candidateValues: candidateNotificationTypes,
})
const sellerStageVocabulary = assertVocabularyExpansion({
  name: sellerStageConstraintName,
  baseValues: baseSellerStages,
  candidateValues: candidateSellerStages,
})
const sellerFunnelCompatibility = assertSellerFunnelCompatibility(candidateSellerStageSql, baseSellerStages)

const baseFunctionSql = latestSqlContaining(baseMigrations, `create or replace function public.${buyerFunctionName}`)
const candidateFunctionSql = latestSqlContaining(candidateMigrations, `create or replace function public.${buyerFunctionName}`)
const buyerFunction = assertStableFunctionContract({
  name: buyerFunctionName,
  baseContract: extractFunctionContract(baseFunctionSql, buyerFunctionName),
  candidateContract: extractFunctionContract(candidateFunctionSql, buyerFunctionName),
})
const destructiveDdl = assertNoHardDestructiveDdl(changedMigrations)

let liveData = { checked: false }
if (requireLive) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  assert.ok(url && key, 'Live compatibility requires production Supabase URL and service role key')
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const [observedNotificationTypes, observedSellerStages] = await Promise.all([
    readObservedValues(client, 'commercial_notification_receipts', 'notification_type'),
    readObservedValues(client, 'seller_funnel_events', 'stage'),
  ])
  liveData = {
    checked: true,
    notificationTypes: validateLiveVocabulary({
      name: 'commercial_notification_receipts.notification_type',
      observedValues: observedNotificationTypes,
      allowedValues: candidateNotificationTypes,
    }),
    sellerStages: validateLiveVocabulary({
      name: 'seller_funnel_events.stage',
      observedValues: observedSellerStages,
      allowedValues: candidateSellerStages,
    }),
  }
}

console.log(JSON.stringify({
  kind: 'aerotrade_release_backward_compatibility',
  containsPii: false,
  baseCommit,
  candidateCommit,
  migrationCount: changedMigrations.length,
  notificationVocabulary,
  sellerStageVocabulary,
  sellerFunnelCompatibility,
  buyerFunction,
  destructiveDdl,
  liveData,
  productionMutated: false,
}, null, 2))
