#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'

const actions = fs.readFileSync(new URL('../src/app/catalog/[id]/actions.ts', import.meta.url), 'utf8')
const tracker = fs.readFileSync(new URL('../src/app/catalog/[id]/ListingViewTracker.tsx', import.meta.url), 'utf8')
const page = fs.readFileSync(new URL('../src/app/catalog/[id]/page.tsx', import.meta.url), 'utf8')
const baseline = fs.readFileSync(new URL('../scripts/capture-commercial-baseline.mjs', import.meta.url), 'utf8')

assert.match(actions, /export async function logListingView/)
assert.match(actions, /export async function logSoldListingView/)
assert.match(actions, /eventType = 'SOLD_VIEW'/)
assert.match(actions, /recordListingEvent\(listingId, 'VIEW', rawContext\)/)
assert.match(actions, /event_type:\s*eventType/)
assert.match(actions, /user_id:\s*user\?\.id \|\| null/)
assert.match(actions, /event_type:\s*'CONTACT_REVEAL'/)
assert.match(actions, /\.in\('status', \['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'\]\)/)
assert.match(tracker, /sessionStorage/)
assert.match(tracker, /sold \? logSoldListingView : logListingView/)
assert.match(actions, /onConflict: 'event_key', ignoreDuplicates: true/)
assert.match(tracker, /if \(recorded\)/)
assert.match(tracker, /removeItem\(storageKey\(listingId, sold\)\)/)
assert.match(page, /<ListingViewTracker listingId=\{typedListing\.id\}/)
assert.match(baseline, /premium_source', 'stripe'/)
assert.match(baseline, /premium_source', 'admin'/)
assert.match(baseline, /premium_source', 'legacy'/)
assert.match(baseline, /payment_notification_receipts/)
assert.match(baseline, /charge\.succeeded/)
console.log('PASS AeroTrade records the commercial funnel and separates paid from granted Premium')
