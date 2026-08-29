#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const tempPrefix = join(tmpdir(), 'aerotrade-netlify-gate-')
const tempRoot = mkdtempSync(tempPrefix)
const tempIndex = join(tempRoot, 'index')
const baseRef = process.argv[2] || 'origin/main'

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    input: options.input,
    maxBuffer: 16 * 1024 * 1024,
  })
  if (!options.allowedStatuses?.includes(result.status) && result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `:\n${detail}` : ''}`)
  }
  return result
}

function git(args, options = {}) {
  return run('git', args, options).stdout.trim()
}

function runGate(cachedCommit, currentCommit) {
  return run(process.execPath, ['scripts/netlify-ignore-build.mjs'], {
    env: { CACHED_COMMIT_REF: cachedCommit, COMMIT_REF: currentCommit },
    allowedStatuses: [0, 1],
  })
}

try {
  const baseCommit = git(['rev-parse', baseRef])
  const candidateCommit = git(['rev-parse', 'HEAD'])
  assert.equal(git(['merge-base', baseCommit, candidateCommit]), baseCommit, 'Candidate is not a fast-forward descendant of the production base')

  const changedFiles = git(['diff', '--name-only', baseCommit, candidateCommit]).split(/\r?\n/).filter(Boolean)
  assert.ok(changedFiles.includes('release/netlify-production.json'), 'Candidate does not change the explicit production release marker')

  const candidateGate = runGate(baseCommit, candidateCommit)
  assert.equal(candidateGate.status, 1, 'Candidate should request exactly one Netlify build')
  assert.match(candidateGate.stdout, /explicit production release marker changed/)

  const gitEnv = {
    GIT_INDEX_FILE: tempIndex,
    GIT_AUTHOR_NAME: 'AeroTrade local release rehearsal',
    GIT_AUTHOR_EMAIL: 'local-rehearsal@invalid.example',
    GIT_COMMITTER_NAME: 'AeroTrade local release rehearsal',
    GIT_COMMITTER_EMAIL: 'local-rehearsal@invalid.example',
  }
  git(['read-tree', candidateCommit], { env: gitEnv })
  const docBlob = git(['hash-object', '-w', '--stdin'], { input: 'Local release-gate rehearsal only.\n' })
  git(['update-index', '--add', '--cacheinfo', `100644,${docBlob},reviews/local-release-gate-rehearsal.txt`], { env: gitEnv })
  const docTree = git(['write-tree'], { env: gitEnv })
  const docsOnlyCommit = git(['commit-tree', docTree, '-p', candidateCommit], {
    env: gitEnv,
    input: 'Local docs-only gate rehearsal\n',
  })

  const docsOnlyChanges = git(['diff', '--name-only', candidateCommit, docsOnlyCommit]).split(/\r?\n/).filter(Boolean)
  assert.deepEqual(docsOnlyChanges, ['reviews/local-release-gate-rehearsal.txt'])
  const docsGate = runGate(candidateCommit, docsOnlyCommit)
  assert.equal(docsGate.status, 0, 'A later evidence-only commit should not create another Netlify build')
  assert.match(docsGate.stdout, /production release marker is unchanged/)

  console.log(JSON.stringify({
    kind: 'aerotrade_netlify_release_gate_rehearsal',
    containsPii: false,
    productionAccessed: false,
    netlifyApiAccessed: false,
    netlifyDeploysCreated: 0,
    productionBaseCommit: baseCommit,
    candidateCommit,
    fastForwardCommitCount: Number(git(['rev-list', '--count', `${baseCommit}..${candidateCommit}`])),
    releaseMarkerChanged: true,
    candidateGate: 'build_once',
    laterEvidenceOnlyGate: 'skip',
  }, null, 2))
} finally {
  assert.ok(resolve(tempRoot).startsWith(resolve(tempPrefix)), 'Refusing to remove an unexpected rehearsal path')
  rmSync(tempRoot, { recursive: true, force: true })
}
