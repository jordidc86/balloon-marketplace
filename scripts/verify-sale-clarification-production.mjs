#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'

if (process.env.CONFIRM_READ_ONLY_PRODUCTION !== '1') {
  throw new Error('Set CONFIRM_READ_ONLY_PRODUCTION=1 for the bounded production verification.')
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anonKey || !serviceRoleKey) throw new Error('Missing production Supabase configuration.')

const options = { auth: { persistSession: false, autoRefreshToken: false } }
const anonymous = createClient(url, anonKey, options)
const service = createClient(url, serviceRoleKey, options)

const countClarifications = async () => {
  const { count, error } = await service
    .from('listing_sale_clarifications')
    .select('id', { count: 'exact', head: true })
  if (error) throw new Error(`Clarification count failed: ${error.message}`)
  return count ?? 0
}

const before = await countClarifications()
const { error: unauthorizedError } = await anonymous.rpc('clarify_listing_sale_by_admin', {
  p_lifecycle_event_id: '00000000-0000-4000-8000-000000000000',
  p_sale_channel: 'OTHER_CHANNEL',
})
const after = await countClarifications()

if (!unauthorizedError) throw new Error('Anonymous sale clarification was not rejected.')
if (before !== after) throw new Error('The unauthorized verification changed clarification state.')

console.log(JSON.stringify({
  kind: 'aerotrade_sale_clarification_access_verification',
  containsPii: false,
  clarificationsBefore: before,
  anonymousAttemptRejected: true,
  anonymousErrorCode: unauthorizedError.code || null,
  clarificationsAfter: after,
  stateUnchanged: true,
}, null, 2))
