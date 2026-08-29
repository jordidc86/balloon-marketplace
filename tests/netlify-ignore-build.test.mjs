import test from 'node:test'
import assert from 'node:assert/strict'
import { isNetlifyRuntimeChange, shouldRunNetlifyBuild } from '../scripts/netlify-ignore-build.mjs'

test('Netlify build gate skips only known non-runtime evidence changes', () => {
  assert.equal(shouldRunNetlifyBuild(['reviews/latest-summary.md', 'docs/runbook.md', 'tests/unit.test.mjs']), false)
  assert.equal(shouldRunNetlifyBuild(['supabase/migrations/20260829990000_private_table.sql']), false)
  assert.equal(shouldRunNetlifyBuild(['README.md']), false)
  assert.equal(shouldRunNetlifyBuild(['source-index.md', 'reviews/new-evidence.json']), false)
})

test('Netlify build gate fails safe for application, configuration and unknown changes', () => {
  assert.equal(isNetlifyRuntimeChange('src/app/page.tsx'), true)
  assert.equal(isNetlifyRuntimeChange('netlify/functions/scheduled.mjs'), true)
  assert.equal(isNetlifyRuntimeChange('package.json'), true)
  assert.equal(isNetlifyRuntimeChange('some-new-runtime/file.ts'), true)
  assert.equal(isNetlifyRuntimeChange('scripts/netlify-ignore-build.mjs'), true)
  assert.equal(shouldRunNetlifyBuild(['reviews/evidence.json', 'src/app/page.tsx']), true)
})
