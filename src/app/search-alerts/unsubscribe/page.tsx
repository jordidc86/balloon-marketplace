import { createAdminClient } from '@/utils/supabase/server'
import { verifySearchStop } from '@/utils/saved-searches.mjs'
import { redirect } from 'next/navigation'
export const metadata={title:'Stop search alerts | AeroTrade',robots:{index:false,follow:false}}

async function stopSearch(form:FormData) {
  'use server'
  const id=String(form.get('id')||''); const token=String(form.get('token')||'')
  if(!verifySearchStop(id,token,process.env.SUPABASE_SERVICE_ROLE_KEY)) throw new Error('Invalid search alert link')
  const admin=await createAdminClient()
  const {data,error}=await admin.from('saved_catalog_searches').update({active:false}).eq('id',id).select('active').maybeSingle()
  if(error||(data&&data.active)) throw new Error('Search alert could not be stopped')
  redirect('/search-alerts/unsubscribe?stopped=1')
}

export default async function StopSearchPage({searchParams}:{searchParams:Promise<{id?:string;token?:string;stopped?:string}>}) {
  const params=await searchParams
  const valid=verifySearchStop(params.id,params.token,process.env.SUPABASE_SERVICE_ROLE_KEY)
  return <main className="mx-auto max-w-lg px-5 py-16"><h1 className="text-3xl font-bold">{params.stopped?'Search alerts stopped':'Stop this search alert'}</h1><p className="mt-4 text-muted-foreground">{params.stopped?'No further emails will be sent for this saved search. Your other searches and newsletter preference have not changed.':valid?'Confirm below to stop emails for this search. Your other searches and newsletter preference will stay as they are.':'This link is incomplete or invalid. You can manage your alerts from your pilot dashboard.'}</p>{valid&&!params.stopped?<form action={stopSearch} className="mt-6"><input type="hidden" name="id" value={params.id}/><input type="hidden" name="token" value={params.token}/><button className="min-h-11 rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground">Stop these search alerts</button></form>:null}</main>
}
