'use server'

import { createAdminClient,createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { normalizeSavedSearch,savedSearchMatches } from '@/utils/saved-searches.mjs'
import { readSearchInventory } from '@/utils/saved-search-server'

async function account() {
  const session=await createClient()
  const {data:{user}}=await session.auth.getUser()
  if(!user) redirect('/login?redirectTo=/dashboard/searches')
  const admin=await createAdminClient()
  const {data:profile,error}=await admin.from('users').select('is_premium').eq('id',user.id).single()
  if(error) throw new Error('Account status could not be verified')
  return {admin,user,premium:Boolean(profile?.is_premium)}
}

export async function saveCatalogSearch(form:FormData) {
  const {admin,user,premium}=await account()
  if(!premium) redirect('/pricing')
  let errorMessage=''
  try {
    if(form.get('alerts_consent')!=='yes') throw new Error('Please confirm that you want email alerts for this search')
    const search=normalizeSavedSearch({query:form.get('query'),category:form.get('category'),country:form.get('country'),manufacturer:form.get('manufacturer')})
    const {native,snapshots}=await readSearchInventory(admin)
    const matches=savedSearchMatches(search,native,snapshots)
    const {data,error}=await admin.rpc('create_saved_catalog_search',{p_user_id:user.id,p_query:search.query,p_category:search.category,p_country:search.country,p_manufacturer:search.manufacturer,p_seen_keys:matches.map(item=>item.key)})
    if(error||!data) throw new Error(error?.code==='23505'?'This search is already saved':error?.message||'Search could not be saved')
  } catch(error) { errorMessage=error instanceof Error?error.message:'Search could not be saved' }
  if(errorMessage) redirect('/dashboard/searches?error='+encodeURIComponent(errorMessage))
  revalidatePath('/dashboard/searches')
  redirect('/dashboard/searches?saved=1')
}

export async function setSavedSearchActive(id:string,active:boolean) {
  const {admin,user,premium}=await account()
  if(active&&!premium) redirect('/pricing')
  const {data,error}=await admin.from('saved_catalog_searches').update({active}).eq('id',id).eq('user_id',user.id).select('id,active').single()
  if(error||data?.active!==active) throw new Error('Search preference could not be saved')
  revalidatePath('/dashboard/searches')
}

export async function deleteSavedSearch(id:string) {
  const {admin,user}=await account()
  const {data,error}=await admin.from('saved_catalog_searches').delete().eq('id',id).eq('user_id',user.id).select('id').single()
  if(error||data?.id!==id) throw new Error('Search could not be removed')
  revalidatePath('/dashboard/searches')
}

export async function setListingAlerts(form:FormData) {
  const {admin,user,premium}=await account()
  const enabled=form.get('enabled')==='yes'
  if(enabled&&!premium) redirect('/pricing')
  const {data,error}=await admin.from('users').update({listing_alerts_enabled:enabled}).eq('id',user.id).select('listing_alerts_enabled').single()
  if(error||data?.listing_alerts_enabled!==enabled) throw new Error('Alert preference could not be saved')
  revalidatePath('/dashboard/searches')
}
