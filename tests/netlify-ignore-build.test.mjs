import test from 'node:test'
import assert from 'node:assert/strict'
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
