#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.AEROTRADE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const targetRegistration = String(process.env.TARGET_REGISTRATION || '').trim().toUpperCase()
const expectedTitle = String(process.env.EXPECTED_TITLE_CONTAINS || '').trim().toLowerCase()
const confirm = process.env.CONFIRM_MARK_SOLD === '1'

if (!url || !serviceKey) throw new Error('Missing Supabase production configuration.')
if (!/^[A-Z0-9-]{3,20}$/.test(targetRegistration)) throw new Error('TARGET_REGISTRATION is invalid.')

const normalizeRegistration = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
const normalizedTarget = normalizeRegistration(targetRegistration)
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

const { data: rows, error: rowsError } = await admin
  .from('listings')
  .select('id,title,status,seller_id,details,public_at')
if (rowsError) throw new Error(`Listing lookup failed: ${rowsError.message}`)

const matches = (rows || []).filter((listing) => {
  const registrationMatches = normalizeRegistration(listing.details?.registration) === normalizedTarget
  const titleMatches = !expectedTitle || String(listing.title || '').toLowerCase().includes(expectedTitle)
  return registrationMatches && titleMatches
})

if (matches.length !== 1) {
  if (process.env.ALLOW_READ_ONLY_DIAGNOSTIC === '1' && !confirm) {
    const titleNeedle = expectedTitle || '350'
    const candidates = (rows || [])
      .filter((candidate) => String(candidate.title || '').toLowerCase().includes(titleNeedle))
      .map((candidate) => ({
        listingId: candidate.id,
        title: candidate.title,
        registration: candidate.details?.registration || null,
        status: candidate.status,
        previouslyPublic: Boolean(candidate.public_at),
      }))
    console.log(JSON.stringify({
      mode: 'read_only_diagnostic',
      targetRegistration,
      exactMatchCount: matches.length,
      titleNeedle,
      candidates,
    }, null, 2))
    process.exit(0)
  }
  throw new Error(`Expected exactly one listing for ${targetRegistration}; found ${matches.length}.`)
}

const listing = matches[0]
if (!confirm) {
  console.log(JSON.stringify({
    mode: 'read_only',
    targetRegistration,
    listingId: listing.id,
    title: listing.title,
    status: listing.status,
    previouslyPublic: Boolean(listing.public_at),
    exactMatchCount: matches.length,
  }, null, 2))
  process.exit(0)
}

if (!anonKey) throw new Error('Missing Supabase anonymous key required for an audited admin action.')

if (listing.status !== 'SOLD') {
  const { data: adminProfiles, error: profileError } = await admin
    .from('users')
    .select('id,email,role')
    .eq('role', 'admin')
  if (profileError) throw new Error(`Admin lookup failed: ${profileError.message}`)
  if (!adminProfiles || adminProfiles.length !== 1 || !adminProfiles[0].email) {
    throw new Error(`Expected exactly one administrator account; found ${adminProfiles?.length || 0}.`)
  }

  // Generate, but do not send, a one-time operator link so the existing audited
  // close_listing_by_actor boundary records the actual administrator identity.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: adminProfiles[0].email,
  })
  const tokenHash = link?.properties?.hashed_token
  if (linkError || !tokenHash) throw new Error(`Administrator capability could not be created: ${linkError?.message || 'missing token'}`)

  const sessionClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: verified, error: verifyError } = await sessionClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  })
  if (verifyError || verified.user?.id !== adminProfiles[0].id) {
    throw new Error(`Administrator capability verification failed: ${verifyError?.message || 'identity mismatch'}`)
  }

  const { data: closure, error: closureError } = await sessionClient.rpc('close_listing_by_actor', {
    p_listing_id: listing.id,
    p_action: 'SOLD',
    p_sale_channel: 'NOT_DISCLOSED',
    p_marketplace_inquiry_id: null,
    p_gross_amount_minor: null,
    p_currency: null,
  })
  const closureResult = Array.isArray(closure) ? closure[0] : closure
  if (closureError || closureResult?.listing_status !== 'SOLD' || !closureResult?.event_id) {
    throw new Error(`Audited listing closure failed: ${closureError?.message || 'invalid result'}`)
  }
}

const [{ data: readback, error: readbackError }, { data: lifecycle, error: lifecycleError }] = await Promise.all([
  admin.from('listings').select('id,title,status,details,public_at').eq('id', listing.id).single(),
  admin
    .from('listing_lifecycle_events')
    .select('id,event_type,sale_channel,actor_role,new_status,created_at')
    .eq('listing_id', listing.id)
    .eq('event_type', 'SOLD')
    .single(),
])
if (readbackError || readback?.status !== 'SOLD') throw new Error('Sold status readback failed.')
if (lifecycleError || lifecycle?.new_status !== 'SOLD' || lifecycle?.actor_role !== 'ADMIN') {
  throw new Error('Audited lifecycle readback failed.')
}

console.log(JSON.stringify({
  mode: listing.status === 'SOLD' ? 'already_sold_verified' : 'marked_sold',
  targetRegistration,
  listingId: listing.id,
  title: readback.title,
  status: readback.status,
  publicSoldReferenceRetained: Boolean(readback.public_at),
  lifecycle: {
    eventType: lifecycle.event_type,
    saleChannel: lifecycle.sale_channel,
    actorRole: lifecycle.actor_role,
    newStatus: lifecycle.new_status,
    createdAt: lifecycle.created_at,
  },
  readbackVerified: true,
}, null, 2))
