import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const route = fs.readFileSync(new URL('../src/app/api/cron/newsletter/route.ts', import.meta.url), 'utf8')

test('newsletter dry-run is observational and cannot create delivery evidence', () => {
  const earlyReturn = route.indexOf('if (params.dryRun) {')
  const runInsert = route.indexOf(".from('newsletter_runs')\n    .insert")
  assert.ok(earlyReturn > 0)
  assert.ok(runInsert > earlyReturn)
  assert.match(route, /id: `dry-run:\$\{runPeriodKey\}`/)
  assert.match(route, /persisted: false/)
  assert.match(route, /activeRun\?\.persisted === false\s*\? Promise\.resolve\(\)/)
  assert.match(route, /activeRun && activeRun\.persisted !== false/)
})
