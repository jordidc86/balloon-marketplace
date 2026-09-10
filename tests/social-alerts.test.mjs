import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('receipt-guarded social placements are reported as skips, not failures', () => {
  const route = readFileSync(resolve(root, 'src/app/api/cron/instagram/route.ts'), 'utf8')

  assert.match(route, /type SocialSkip/)
  assert.match(route, /const skips: SocialSkip\[\] = \[\]/)
  assert.match(route, /recordSkip\(input\.contentId/)
  assert.doesNotMatch(route, /Social publication receipt blocked the provider call/)
})
