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
])

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
  return Array.isArray(files) && files.some(isNetlifyRuntimeChange)
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
  if (runtimeFiles.length === 0) {
    console.log(`Netlify build gate: skipping ${files.length} non-runtime file change(s).`)
    process.exit(0)
  }
  console.log(`Netlify build gate: building for ${runtimeFiles.length} runtime-relevant file change(s).`)
  process.exit(1)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) run()
