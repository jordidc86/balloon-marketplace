import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { externalMigrationGuardSql, withExternalMigrationGuardsSync } from '../scripts/lib/external-migration-guards.mjs'

const version = '20260925160000'
function fixture(run) { const directory = mkdtempSync(join(tmpdir(), 'aerotrade-guard-test-')); try { run(directory) } finally { rmSync(directory, { recursive: true, force: true }) } }

test('guard only exists during synchronous CLI execution and cannot apply historical SQL', () => fixture(directory => {
  const result = withExternalMigrationGuardsSync(directory, [version], [version], () => {
    const [file] = readdirSync(directory)
    assert.match(file, /^20260925160000_/)
    const sql = readFileSync(join(directory, file), 'utf8')
    assert.match(sql, /RAISE EXCEPTION/)
    assert.doesNotMatch(sql, /CREATE TABLE|ALTER TABLE|INSERT INTO|DELETE FROM/i)
    return 42
  })
  assert.equal(result, 42); assert.deepEqual(readdirSync(directory), [])
}))

test('guard cleanup also runs when the CLI fails', () => fixture(directory => {
  assert.throws(() => withExternalMigrationGuardsSync(directory, [version], [version], () => { throw Error('CLI failed') }), /CLI failed/)
  assert.deepEqual(readdirSync(directory), [])
}))

test('unacknowledged missing remote version cannot be simulated locally', () => fixture(directory => {
  assert.throws(() => withExternalMigrationGuardsSync(directory, [version], [], () => {}), /already exist remotely/)
  assert.deepEqual(readdirSync(directory), [])
}))

test('existing migration files are never overwritten or deleted', () => fixture(directory => {
  writeFileSync(join(directory, version + '_original.sql'), 'select 1;')
  assert.throws(() => withExternalMigrationGuardsSync(directory, [version], [version], () => {}), /already has a local file/)
  assert.equal(readFileSync(join(directory, version + '_original.sql'), 'utf8'), 'select 1;')
}))

test('guard rejects duplicate versions and path injection', () => fixture(directory => {
  assert.throws(() => withExternalMigrationGuardsSync(directory, [version, version], [version], () => {}), /Duplicate/)
  assert.throws(() => externalMigrationGuardSql('../outside'))
}))
