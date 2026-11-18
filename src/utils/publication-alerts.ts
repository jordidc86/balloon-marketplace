import type { SupabaseClient } from '@supabase/supabase-js'
import { sendPremiumListingAlert } from './premium-alerts'

export async function deliverPublicationAlert(client:SupabaseClient,listingId:string) {
  const {data:queued,error}=await client.from('listing_publication_alerts').select('status').eq('listing_id',listingId).maybeSingle()
  if(error) throw new Error('Publication alert receipt unavailable')
  if(!queued||queued.status!=='pending') return {status:'skipped'}
  try {
    const {data:listing,error:listingError}=await client.from('listings').select('status').eq('id',listingId).single()
    if(listingError) throw new Error('Publication state unavailable')
    if(!['ACTIVE_PUBLIC','ACTIVE_PREMIUM'].includes(listing.status)) {
      await client.from('listing_publication_alerts').update({status:'completed',completed_at:new Date().toISOString()}).eq('listing_id',listingId)
      return {status:'cancelled'}
    }
    const delivery=await sendPremiumListingAlert(client,listingId)
    // A concurrent sender owns the run; let the next scheduled check reconcile it.
    if(delivery.duplicate&&delivery.status==='running') return {status:'pending'}
    const status=delivery.duplicate&&delivery.status==='partial'?'attention':'completed'
    const {data:stored,error:storeError}=await client.from('listing_publication_alerts').update({status,completed_at:new Date().toISOString()}).eq('listing_id',listingId).eq('status','pending').select('status').maybeSingle()
    if(storeError) throw new Error('Publication alert completion unavailable')
    if(!stored) {
      const {data:concurrent}=await client.from('listing_publication_alerts').select('status').eq('listing_id',listingId).single()
      if(concurrent?.status==='completed') return {status:'completed'}
      throw new Error('Publication alert completion unavailable')
    }
    return {status}
  } catch(error) {
    await client.from('listing_publication_alerts').update({status:'attention'}).eq('listing_id',listingId).eq('status','pending')
    console.error('Publication alert needs review',listingId,error)
    return {status:'attention'}
  }
}

export async function processPublicationAlerts(client:SupabaseClient,commit=false) {
  const {data,error}=await client.from('listing_publication_alerts').select('listing_id').eq('status','pending').order('published_at').limit(20)
  if(error) throw new Error('Publication alert queue unavailable')
  const result={due:data.length,completed:0,attention:0,dryRun:!commit}
  if(commit) for(const item of data) {
    const delivered=await deliverPublicationAlert(client,item.listing_id)
    if(delivered.status==='completed') result.completed++
    if(delivered.status==='attention') result.attention++
    await new Promise(resolve=>setTimeout(resolve,650))
  }
  return result
}
