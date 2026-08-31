#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { validateProductionPromotion } from './lib/production-release.mjs'

process.on('uncaughtException', (error) => {
  console.error(JSON.stringify({
    kind: 'aerotrade_netlify_production_promotion',
    containsPii: false,
    result: 'blocked',
    reason: error instanceof Error ? error.message : 'Unknown production promotion failure',
    productionBranchUpdated: false,
    netlifyDeploysRequested: 0,
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
const mergeBaseCommit = git(['merge-base', productionCommit, candidateCommit])
const changedFiles = git(['diff', '--name-only', productionCommit, candidateCommit]).split(/\r?\n/).filter(Boolean)
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
})

if (!apply) {
  output({
    mode: 'dry_run',
    result: 'ready_for_explicit_promotion',
    productionBranchUpdated: false,
    netlifyDeploysRequested: 0,
    ...validation,
  })
  process.exit(0)
}

assert.equal(
  process.env.CONFIRM_AEROTRADE_PRODUCTION_RELEASE,
  marker.releaseId,
  'Set CONFIRM_AEROTRADE_PRODUCTION_RELEASE to the exact releaseId before using --apply',
)

run('npm', ['run', 'verify:production-release'])
run('git', ['push', '--porcelain', 'origin', `${candidateCommit}:refs/heads/production`])
const remoteProductionCommit = git(['ls-remote', '--heads', 'origin', 'refs/heads/production']).split(/\s+/)[0]
assert.equal(remoteProductionCommit, candidateCommit, 'Remote production branch did not persist the promoted commit')

output({
  mode: 'apply',
  result: 'production_branch_promoted',
  productionBranchUpdated: true,
  netlifyDeploysRequested: 1,
  ...validation,
  remoteProductionCommit,
})
