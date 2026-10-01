import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isNetlifyRuntimeChange, netlifyProductionReleaseMarker, shouldRunNetlifyBuild } from '../scripts/netlify-ignore-build.mjs'

test('Netlify build gate skips only known non-runtime evidence changes', () => {
  assert.equal(shouldRunNetlifyBuild(['reviews/latest-summary.md', 'docs/runbook.md', 'tests/unit.test.mjs']), false)
  assert.equal(shouldRunNetlifyBuild(['supabase/migrations/20260829990000_private_table.sql']), false)
  assert.equal(shouldRunNetlifyBuild(['README.md']), false)
  assert.equal(shouldRunNetlifyBuild(['source-index.md', 'reviews/new-evidence.json']), false)
})

test('Netlify production build requires the explicit release marker', () => {
  assert.equal(isNetlifyRuntimeChange('src/app/page.tsx'), true)
  assert.equal(isNetlifyRuntimeChange('netlify/functions/scheduled.mjs'), true)
  assert.equal(isNetlifyRuntimeChange('package.json'), true)
  assert.equal(isNetlifyRuntimeChange('some-new-runtime/file.ts'), true)
  assert.equal(isNetlifyRuntimeChange('scripts/netlify-ignore-build.mjs'), true)
  assert.equal(shouldRunNetlifyBuild(['reviews/evidence.json', 'src/app/page.tsx']), false)
  assert.equal(shouldRunNetlifyBuild([netlifyProductionReleaseMarker]), true)
  assert.equal(shouldRunNetlifyBuild(['src/app/page.tsx', netlifyProductionReleaseMarker]), true)
  assert.equal(shouldRunNetlifyBuild(['release\\netlify-production.json']), true)
})

test('Netlify builds a marked release when its cached and current commit refs are equal', () => {
  const root = mkdtempSync(join(tmpdir(), 'aerotrade-netlify-ignore-'))
  const script = fileURLToPath(new URL('../scripts/netlify-ignore-build.mjs', import.meta.url))
  const git = (args) => {
    const result = spawnSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
      },
    })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }

  try {
    git(['init', '--quiet'])
    mkdirSync(join(root, 'release'))
    writeFileSync(join(root, netlifyProductionReleaseMarker), '{"releaseId":"baseline"}\n')
    git(['add', '.'])
    git(['commit', '--quiet', '-m', 'baseline'])

    writeFileSync(join(root, netlifyProductionReleaseMarker), '{"releaseId":"candidate"}\n')
    git(['add', '.'])
    git(['commit', '--quiet', '-m', 'marked release'])
    const markedCommit = git(['rev-parse', 'HEAD'])
    const marked = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CACHED_COMMIT_REF: markedCommit, COMMIT_REF: markedCommit },
    })
    assert.equal(marked.status, 1)
    assert.match(marked.stdout, /explicit production release marker changed/)

    writeFileSync(join(root, 'README.md'), 'Documentation only\n')
    git(['add', '.'])
    git(['commit', '--quiet', '-m', 'evidence only'])
    const evidenceCommit = git(['rev-parse', 'HEAD'])
    const evidence = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CACHED_COMMIT_REF: evidenceCommit, COMMIT_REF: evidenceCommit },
    })
    assert.equal(evidence.status, 0)
    assert.match(evidence.stdout, /production release marker is unchanged/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
