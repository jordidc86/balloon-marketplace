import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { sellerFunnelEventKey } from '@/utils/seller-funnel.mjs'

export async function persistSellerFunnelEvent(
  supabaseAdmin: SupabaseClient,
  {
    sellerId,
    stage,
    listingId = null,
    listingPlan = null,
    source = 'web',
  }: {
    sellerId: string
    stage: string
    listingId?: string | null
    listingPlan?: 'free' | 'premium' | null
    source?: 'web' | 'stripe' | 'recovery'
  },
) {
  const eventKey = sellerFunnelEventKey({ sellerId, stage, listingId })
  if (!eventKey) return false
  const { error } = await supabaseAdmin.from('seller_funnel_events').upsert({
    event_key: eventKey,
    seller_id: sellerId,
    listing_id: listingId,
    stage,
    listing_plan: listingPlan,
    source,
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (error) {
    console.error(`Could not record seller funnel stage ${stage}:`, error)
    return false
  }
  return true
}
