import assert from 'node:assert/strict'
import { readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function externalMigrationGuardSql(version) {
  assert.match(version, /^\d{14}$/)
  return `-- Temporary CLI recognition of an already-applied external migration.\n-- This is NOT a replacement for the historical SQL and must never be applied.\nDO $aerotrade_guard$ BEGIN\n  RAISE EXCEPTION 'External migration ${version} must never be executed by AeroTrade';\nEND $aerotrade_guard$;\n`
}

// Supabase db push refuses remote-only versions even when our release manifest
// explicitly acknowledges them. Supply fail-closed files only for versions proven
// present remotely; never copy historical SQL, repair the ledger or overwrite files.
// The synchronous CLI invocation must complete before the guards are removed.
export function withExternalMigrationGuardsSync(directory, versions, remoteVersions, action) {
  assert.equal(new Set(versions).size, versions.length, 'Duplicate external migration')
  for (const version of versions) {
    assert.match(version, /^\d{14}$/)
    assert.ok(remoteVersions.includes(version), 'External migration must already exist remotely')
    assert.ok(!readdirSync(directory).some(file => file.startsWith(version + '_')), 'External version already has a local file')
  }
  const created = []
  try {
    for (const version of versions) {
      const path = join(directory, `${version}_external_ledger_guard.sql`)
      const contents = externalMigrationGuardSql(version)
      writeFileSync(path, contents, { flag: 'wx', mode: 0o600 })
      created.push({ path, contents })
    }
    return action()
  } finally {
    for (const { path, contents } of created) {
      assert.equal(readFileSync(path, 'utf8'), contents, 'External guard changed unexpectedly; inspect it before cleanup')
      unlinkSync(path)
    }
  }
}
