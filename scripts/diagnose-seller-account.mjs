#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'

if (process.env.CONFIRM_READ_ONLY_PRODUCTION !== '1') {
  throw new Error('Set CONFIRM_READ_ONLY_PRODUCTION=1 only after explicit approval for a read-only production diagnostic.')
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const targetEmails = String(process.env.TARGET_EMAILS || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean)

if (!url || !key) throw new Error('Missing Supabase production configuration.')
if (targetEmails.length === 0) throw new Error('Set TARGET_EMAILS to one or more comma-separated addresses.')

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const authUsers = []

for (let page = 1; ; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 })
  if (error) throw new Error(`auth.users: ${error.message}`)
  authUsers.push(...data.users)
  if (data.users.length < 100) break
}

const matchedAuthUsers = authUsers.filter((user) => targetEmails.includes(String(user.email || '').toLowerCase()))
const matchedUserIds = matchedAuthUsers.map((user) => user.id)

const { data: profiles, error: profilesError } = matchedUserIds.length > 0
  ? await supabase.from('users').select('id,email,role,created_at').in('id', matchedUserIds)
  : { data: [], error: null }
if (profilesError) throw new Error(`users: ${profilesError.message}`)

const { data: listings, error: listingsError } = matchedUserIds.length > 0
  ? await supabase
    .from('listings')
    .select('id,seller_id,title,status,contact_email,created_at,updated_at,public_at,images(id,url,is_primary,created_at),listing_quality_state(status,last_observation,consecutive_failures,last_checked_at,first_failed_at,quarantined_at,resolved_at,previous_listing_status,notification_status)')
    .in('seller_id', matchedUserIds)
  : { data: [], error: null }
if (listingsError) throw new Error(`listings: ${listingsError.message}`)

const imageChecks = []
for (const listing of listings || []) {
  for (const image of listing.images || []) {
    try {
      const response = await fetch(image.url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(8_000),
        headers: { Accept: 'image/*' },
      })
      imageChecks.push({
        listingId: listing.id,
        imageId: image.id,
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type'),
      })
    } catch (error) {
      imageChecks.push({
        listingId: listing.id,
        imageId: image.id,
        ok: false,
        status: null,
        contentType: null,
        error: error instanceof Error ? error.name : 'unknown',
      })
    }
  }
}

const authByEmail = new Map(matchedAuthUsers.map((user) => [String(user.email || '').toLowerCase(), user]))
const result = {
  readOnly: true,
  capturedAt: new Date().toISOString(),
  targets: targetEmails.map((email, index) => {
    const user = authByEmail.get(email)
    return {
      targetIndex: index + 1,
      authUserFound: Boolean(user),
      userId: user?.id || null,
      emailConfirmed: Boolean(user?.email_confirmed_at),
      lastSignInAt: user?.last_sign_in_at || null,
      createdAt: user?.created_at || null,
    }
  }),
  profiles: profiles || [],
  listings: listings || [],
  imageChecks,
}

console.log(JSON.stringify(result, null, 2))
