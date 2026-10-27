import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

test('production audit commands reject missing approval before configuration or network access', () => {
  for (const [script, guard] of [
    ['capture-commercial-baseline', 'CONFIRM_READ_ONLY_PRODUCTION'],
    ['capture-stripe-commercial-audit', 'CONFIRM_READ_ONLY_STRIPE'],
    ['capture-social-publication-audit', 'CONFIRM_READ_ONLY_META'],
    ['capture-production-automation-observation', 'CONFIRM_READ_ONLY_PRODUCTION'],
    ['capture-production-automation-dry-run', 'CONFIRM_READ_ONLY_PRODUCTION'],
  ]) {
    const result = spawnSync(process.execPath, [`scripts/${script}.mjs`], { cwd: new URL('..', import.meta.url), env: {}, encoding: 'utf8', timeout: 5000 })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, new RegExp(guard))
  }
})
test('read-only approval never authorizes cron simulation', () => {
  const result = spawnSync(process.execPath, ['scripts/capture-production-automation-dry-run.mjs'], {
    cwd: new URL('..', import.meta.url), env: { CONFIRM_READ_ONLY_PRODUCTION: '1' }, encoding: 'utf8', timeout: 5000,
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /CONFIRM_PRODUCTION_CRON_SIMULATION/)
})
