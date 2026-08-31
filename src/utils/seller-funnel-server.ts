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
    entryContext = 'system',
    channel = null,
  }: {
    sellerId: string
    stage: string
    listingId?: string | null
    listingPlan?: 'free' | 'premium' | null
    source?: 'web' | 'stripe' | 'recovery'
    entryContext?: string
    channel?: 'native' | 'whatsapp' | 'email' | 'copy' | 'linkedin' | 'facebook' | null
  },
) {
  const eventKey = sellerFunnelEventKey({ sellerId, stage, listingId, channel })
  if (!eventKey) return false
  const { error } = await supabaseAdmin.from('seller_funnel_events').upsert({
    event_key: eventKey,
    seller_id: sellerId,
    listing_id: listingId,
    stage,
    listing_plan: listingPlan,
    source,
    entry_context: entryContext,
    channel,
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (error) {
    console.error(`Could not record seller funnel stage ${stage}:`, error)
    return false
  }
  return true
}
