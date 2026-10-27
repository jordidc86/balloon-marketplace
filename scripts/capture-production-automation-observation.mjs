#!/usr/bin/env node
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { readAllRows, readOnlyFetch } from './lib/read-only-audit.mjs'
import { stateSpecs } from './lib/automation-state-specs.mjs'

if (process.env.CONFIRM_READ_ONLY_PRODUCTION !== '1') throw new Error('Set CONFIRM_READ_ONLY_PRODUCTION=1 for an approved observation.')
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Observation configuration is incomplete.')
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: readOnlyFetch } })
const startedAt = new Date().toISOString()
const datasets = Object.fromEntries(await Promise.all(Object.entries(stateSpecs).map(async ([name, [table, columns]]) => {
  const rows = await readAllRows(() => supabase.from(table).select(columns, { count: 'exact' }).order(columns.split(',')[0]))
  return [name, { rows: rows.length, fingerprint: createHash('sha256').update(JSON.stringify(rows)).digest('hex'), paginationComplete: true }]
})))
const report = {
  schemaVersion: 1, kind: 'aerotrade_automation_observation', startedAt, completedAt: new Date().toISOString(),
  readOnly: true, containsPii: false, cronEndpointsCalled: 0, providerDeliveryVerified: false,
  caveat: 'Paginated observations are not a transactional snapshot or evidence of provider delivery.', datasets,
}
const output = path.resolve(process.argv[2] || 'reviews/production-automation-observation.json')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(`Read-only automation observation written to ${output}`)
