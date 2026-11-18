import { createClient } from '@supabase/supabase-js'
import { authorizedRefresh } from '../../src/utils/global-search/refresh.mjs'
import { processPublicationAlerts } from '../../src/utils/publication-alerts'
import { processSavedSearchAlerts } from '../../src/utils/saved-search-server'

export const config={background:true}

export default async function buyerAlertsBackground(request:Request) {
  if(!authorizedRefresh(request,process.env.CRON_SECRET)) { console.error('Unauthorized buyer alert request'); return }
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!url||!key) throw new Error('Buyer alert configuration unavailable')
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  try {
    const publication=await processPublicationAlerts(client,true)
    const savedSearches=await processSavedSearchAlerts(client,{commit:true})
    console.log(JSON.stringify({kind:'buyer_alerts',publication,savedSearches}))
    if(publication.attention||savedSearches.failed||savedSearches.uncertain) console.error('Buyer alerts need receipt review; uncertain deliveries are not automatically resent')
  } catch { console.error('Buyer alert run incomplete; reconcile persisted receipts before retrying') }
}
