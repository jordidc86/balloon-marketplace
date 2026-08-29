#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const nonRuntimePrefixes = Object.freeze([
  '.github/',
  'docs/',
  'reviews/',
  'supabase/migrations/',
  'tests/',
])

const nonRuntimeExact = new Set([
  'README.md',
  'memory.md',
  'source-index.md',
])

export const netlifyProductionReleaseMarker = 'release/netlify-production.json'

export function isNetlifyRuntimeChange(file) {
  const normalized = typeof file === 'string' ? file.trim().replaceAll('\\', '/') : ''
  if (!normalized) return false
  if (normalized === 'scripts/netlify-ignore-build.mjs') return true
  if (nonRuntimeExact.has(normalized)) return false
  if (nonRuntimePrefixes.some((prefix) => normalized.startsWith(prefix))) return false
  if (normalized.startsWith('scripts/')) return false
  return true
}

export function shouldRunNetlifyBuild(files) {
  return Array.isArray(files) && files.some((file) => file.trim().replaceAll('\\', '/') === netlifyProductionReleaseMarker)
}

function run() {
  const cachedCommit = process.env.CACHED_COMMIT_REF?.trim()
  const currentCommit = process.env.COMMIT_REF?.trim()
  if (!cachedCommit || !currentCommit || !/^[0-9a-f]{7,40}$/i.test(cachedCommit) || !/^[0-9a-f]{7,40}$/i.test(currentCommit)) {
    console.log('Netlify build gate: commit range unavailable; building safely.')
    process.exit(1)
  }

  const comparison = spawnSync('git', ['diff', '--name-only', cachedCommit, currentCommit], { encoding: 'utf8' })
  if (comparison.status !== 0) {
    console.log('Netlify build gate: diff unavailable; building safely.')
    process.exit(1)
  }
  const files = comparison.stdout.split(/\r?\n/).map((file) => file.trim()).filter(Boolean)
  const runtimeFiles = files.filter(isNetlifyRuntimeChange)
  if (!shouldRunNetlifyBuild(files)) {
    console.log(`Netlify build gate: staging ${runtimeFiles.length} runtime-relevant change(s); production release marker is unchanged.`)
    process.exit(0)
  }
  console.log(`Netlify build gate: explicit production release marker changed; building ${runtimeFiles.length} runtime-relevant change(s).`)
  process.exit(1)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) run()
