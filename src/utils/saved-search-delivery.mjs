import { savedSearchLabel,savedSearchPath,signSearchStop } from './saved-searches.mjs'
import { GLOBAL_SEARCH_SOURCES,safeListingUrl } from './global-search/sources.mjs'
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')

export function searchDigestEmail(search,digest,origin,secret) {
  const token=signSearchStop(search.id,secret)
  if(!token) throw new Error('Search stop link unavailable')
  const tracked=(path)=>{const url=new URL(path,origin);url.searchParams.set('utm_source','premium_alert');url.searchParams.set('utm_medium','email');url.searchParams.set('utm_campaign','saved_search');return escape(url.href)}
  const items=digest.items.map(item=>{
    let path
    if(/^\/catalog\/[0-9a-f-]{36}$/i.test(item.path||'')) path=item.path
    else for(const source of GLOBAL_SEARCH_SOURCES) { const safe=safeListingUrl(item.url,source); if(safe) {path=safe;break} }
    if(!path) throw new Error('Unsafe search match link')
    return `<div style="padding:16px 0;border-top:1px solid #eee"><a style="color:#c2410c;font-weight:bold" href="${tracked(path)}">${escape(item.title)}</a><p>${escape(item.price)} · ${escape(item.source||'AeroTrade')}</p></div>`
  }).join('')
  const stop=`${new URL('/search-alerts/unsubscribe',origin).href}?id=${search.id}&token=${token}`
  return {subject:`AeroTrade: new matches for ${savedSearchLabel(search)}`,html:`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#17202a"><p style="color:#ea580c;font-weight:bold">AEROTRADE PREMIUM</p><h1>New matches for your search</h1><p>${escape(savedSearchLabel(search))}</p>${items}<p>${digest.match_count>20?`${Number(digest.match_count)} new matches were found. `:''}<a href="${tracked(savedSearchPath(search))}">View your search</a></p><p>These are newly detected matches, not necessarily newly published adverts. Other marketplaces are reviewed daily; availability is confirmed by the original seller.</p><p><a href="${escape(stop)}">Stop this search alert</a> · <a href="${escape(new URL('/dashboard/searches',origin).href)}">Manage saved searches</a></p></div>`}
}

// Claim before calling the provider. A crash or failed acceptance readback leaves
// 'sending'/'uncertain', never 'prepared', so no automatic duplicate can occur.
export async function dispatchPreparedSearchDigest(client,{search,digest,to,origin,secret,now=new Date()},send) {
  if(digest.status!=='prepared') return 'skipped'
  const content=searchDigestEmail(search,digest,origin,secret)
  const {data:claimed,error}=await client.from('saved_search_digests').update({status:'sending',attempted_at:now.toISOString()}).eq('id',digest.id).eq('status','prepared').select('id').maybeSingle()
  if(error) throw new Error('Search digest claim failed')
  if(!claimed) return 'skipped'
  try {
    const delivery=await send(to,content.subject,content.html,{idempotencyKey:`saved-search/${digest.id}`})
    const status=delivery.success&&delivery.resendId?'accepted':'uncertain'
    const {data:stored,error:storeError}=await client.from('saved_search_digests').update({status,provider_message_id:delivery.resendId||null,accepted_at:status==='accepted'?new Date().toISOString():null}).eq('id',digest.id).eq('status','sending').select('status,provider_message_id').single()
    if(storeError||stored?.status!==status||(status==='accepted'&&!stored.provider_message_id)) return 'uncertain'
    return status
  } catch {
    await client.from('saved_search_digests').update({status:'uncertain'}).eq('id',digest.id).eq('status','sending')
    return 'uncertain'
  }
}
