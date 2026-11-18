import type { SupabaseClient } from '@supabase/supabase-js'
import { savedSearchMatches } from './saved-searches.mjs'
import { dispatchPreparedSearchDigest } from './saved-search-delivery.mjs'
import { sendEmail } from './resend'
import { siteUrl } from './site'

type Search = { id:string; user_id:string; query:string; category:string; country:string; manufacturer:string; active:boolean }

// Exact counts prevent a capped PostgREST response becoming an incomplete baseline.
async function readRows(client: SupabaseClient, table:string, columns:string) {
  const rows:Record<string,unknown>[] = []
  for(let offset=0; offset<10000; offset+=500) {
    const { data, error, count } = await client.from(table).select(columns,{count:'exact'}).order(table==='external_catalog_sources'?'source_id':'id').range(offset,offset+499)
    if(error || !data || count===null) throw new Error('Search alert inventory unavailable')
    rows.push(...data as unknown as Record<string,unknown>[])
    if(rows.length===count) return rows
    if(!data.length || rows.length>count) throw new Error('Search alert inventory changed while reading')
  }
  throw new Error('Search alert inventory exceeds safe limit')
}

export async function readSearchInventory(client:SupabaseClient) {
  const [native,sources] = await Promise.all([
    readRows(client,'listings','id,title,description,category,currency,price,location_country,details,status,public_at'),
    readRows(client,'external_catalog_sources','source_id,snapshot'),
  ])
  return { native, snapshots:sources.map(row => row.snapshot) }
}

export async function processSavedSearchAlerts(client:SupabaseClient,{commit=false,now=new Date()}={}) {
  const result = { checked:0, due:0, accepted:0, failed:0, uncertain:0, cancelled:0, dryRun:!commit }
  // Reuse the four-hour listing-watch scheduler after the 04:00 UTC crawl.
  // Each saved search is checked at most once per UTC day, starting at 08:15.
  if(now.getUTCHours()<6) return result
  const day=now.toISOString().slice(0,10)
  const searches = (await readRows(client,'saved_catalog_searches','id,user_id,query,category,country,manufacturer,active,last_checked_day')).filter(row=>row.active) as unknown as Search[]
  if(!searches.length) return result
  const { native,snapshots }=await readSearchInventory(client)
  for(const search of searches) {
    const { data:user,error:userError }=await client.from('users').select('email,is_premium').eq('id',search.user_id).single()
    if(userError) { result.failed++; continue }
    if(!user?.is_premium) continue
    result.checked++
    const matches=savedSearchMatches(search,native,snapshots,now.getTime())
    if(!commit) continue
    const { data:id,error }=await client.rpc('prepare_saved_search_digest',{p_search_id:search.id,p_day:day,p_matches:matches})
    if(error) { result.failed++; continue }
    if(!id) continue
    const { data:digest,error:readError }=await client.from('saved_search_digests').select('id,status,items,match_count').eq('id',id).single()
    if(readError) { result.failed++; continue }
    if(digest.status!=='prepared') { if(digest.status==='sending'||digest.status==='uncertain') result.uncertain++; continue }
    result.due++
    // Recheck consent and membership immediately before the single atomic claim.
    const [{data:current},{data:member}] = await Promise.all([
      client.from('saved_catalog_searches').select('active').eq('id',search.id).single(),
      client.from('users').select('email,is_premium').eq('id',search.user_id).single(),
    ])
    if(!current?.active || !member?.is_premium || !member.email) {
      await client.from('saved_search_digests').update({status:'cancelled'}).eq('id',id).eq('status','prepared')
      result.cancelled++; continue
    }
    try {
      const status=await dispatchPreparedSearchDigest(client,{search,digest,to:member.email,origin:siteUrl,secret:process.env.SUPABASE_SERVICE_ROLE_KEY,now},sendEmail)
      if(status==='accepted') result.accepted++
      if(status==='uncertain') result.uncertain++
      // Pace sends and leave capacity for other operational email.
      if(status!=='skipped') await new Promise(resolve=>setTimeout(resolve,650))
    } catch { result.failed++ }
  }
  return result
}
