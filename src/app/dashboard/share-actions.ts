'use server'

import { createAdminClient, createClient } from '@/utils/supabase/server'
import { normalizeSellerListingShareChannel } from '@/utils/seller-funnel.mjs'
import { persistSellerFunnelEvent } from '@/utils/seller-funnel-server'

const listingIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function recordSellerListingShare(listingId: string, rawChannel: unknown) {
  const channel = normalizeSellerListingShareChannel(rawChannel) as 'native' | 'whatsapp' | 'email' | 'copy' | 'linkedin' | 'facebook' | null
  if (!listingIdPattern.test(String(listingId || '')) || !channel) return false
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: listing, error } = await supabase
    .from('listings')
    .select('id,seller_id,status,details')
    .eq('id', listingId)
    .eq('seller_id', user.id)
    .single()
  if (error || !listing || !['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'].includes(listing.status)) return false
  const listingPlan = listing.details && typeof listing.details === 'object' && listing.details.listing_plan === 'premium' ? 'premium' : 'free'
  return persistSellerFunnelEvent(await createAdminClient(), {
    sellerId: user.id,
    listingId: listing.id,
    listingPlan,
    stage: 'LISTING_SHARED',
    entryContext: 'dashboard',
    channel,
  })
}
