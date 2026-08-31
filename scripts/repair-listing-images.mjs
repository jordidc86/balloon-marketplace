#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import {
  getAllowedListingImageHosts,
  listingImageObservations,
  probeListingImageUrl,
} from '../src/utils/listing-image-quality.mjs'

if (process.env.CONFIRM_PRODUCTION_REPAIR !== '1') {
  throw new Error('Set CONFIRM_PRODUCTION_REPAIR=1 only after explicit approval for the exact listing repair.')
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const listingId = String(process.env.LISTING_ID || '').trim()
const removeMissing = process.env.REMOVE_DEFINITIVELY_MISSING === '1'

if (!url || !key) throw new Error('Missing Supabase production configuration.')
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(listingId)) {
  throw new Error('LISTING_ID must be one exact UUID.')
}

const allowedHostnames = getAllowedListingImageHosts(url)
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: listing, error: listingError } = await supabase
  .from('listings')
  .select('id,status,images(id,url,is_primary,created_at)')
  .eq('id', listingId)
  .single()
if (listingError || !listing) throw new Error('The exact listing could not be loaded.')

const observations = []
for (const image of listing.images || []) {
  const result = await probeListingImageUrl(image.url, { allowedHostnames })
  observations.push({ image, observation: result.observation })
}

const reachable = observations.filter((entry) => entry.observation === listingImageObservations.AVAILABLE)
const missing = observations.filter((entry) => entry.observation === listingImageObservations.DEFINITELY_MISSING)
const unknown = observations.filter((entry) => entry.observation === listingImageObservations.UNKNOWN)
if (reachable.length === 0) throw new Error('No reachable image exists; the listing was not changed.')

const target = reachable.find((entry) => entry.image.is_primary)?.image || reachable[0].image
const originalPrimary = (listing.images || []).find((image) => image.is_primary)
if (originalPrimary?.id !== target.id) {
  const { error: clearError } = await supabase.from('images').update({ is_primary: false }).eq('listing_id', listingId)
  if (clearError) throw new Error('The previous cover could not be cleared.')
  const { error: setError } = await supabase.from('images').update({ is_primary: true }).eq('listing_id', listingId).eq('id', target.id)
  if (setError) {
    if (originalPrimary) await supabase.from('images').update({ is_primary: true }).eq('listing_id', listingId).eq('id', originalPrimary.id)
    throw new Error('The reachable cover could not be selected.')
  }
}

if (removeMissing && missing.length > 0) {
  const missingIds = missing.map((entry) => entry.image.id)
  const { error: deleteError } = await supabase.from('images').delete().eq('listing_id', listingId).in('id', missingIds)
  if (deleteError) throw new Error('Definitively missing image references could not be removed.')
}

const { data: readback, error: readbackError } = await supabase
  .from('images')
  .select('id,is_primary')
  .eq('listing_id', listingId)
if (readbackError) throw new Error('Listing image repair readback failed.')
const primaryIds = (readback || []).filter((image) => image.is_primary).map((image) => image.id)
const remainingIds = new Set((readback || []).map((image) => image.id))
if (primaryIds.length !== 1 || primaryIds[0] !== target.id) throw new Error('Listing cover repair was not verified.')
if (removeMissing && missing.some((entry) => remainingIds.has(entry.image.id))) throw new Error('Missing image cleanup was not verified.')

console.log(JSON.stringify({
  listingId,
  status: listing.status,
  reachableImages: reachable.length,
  definitivelyMissingImages: missing.length,
  inconclusiveImages: unknown.length,
  coverRepaired: originalPrimary?.id !== target.id,
  missingReferencesRemoved: removeMissing ? missing.length : 0,
  remainingImageRows: readback?.length || 0,
  readbackVerified: true,
}, null, 2))
