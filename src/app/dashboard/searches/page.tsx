import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { savedSearchLabel,savedSearchPath } from '@/utils/saved-searches.mjs'
import { deleteSavedSearch,setListingAlerts,setSavedSearchActive } from './actions'
export const metadata={title:'My search alerts | AeroTrade',robots:{index:false,follow:false}}

export default async function SearchAlertsPage({searchParams}:{searchParams:Promise<{error?:string;saved?:string}>}) {
  const client=await createClient()
  const {data:{user}}=await client.auth.getUser()
  if(!user) redirect('/login?redirectTo=/dashboard/searches')
  const [{data:profile,error:profileError},{data:searches,error:searchError},params]=await Promise.all([
    client.from('users').select('is_premium,listing_alerts_enabled').eq('id',user.id).single(),
    client.from('saved_catalog_searches').select('id,query,category,country,manufacturer,active,created_at').eq('user_id',user.id).order('created_at',{ascending:false}),searchParams,
  ])
  if(profileError||searchError) throw new Error('Search preferences are temporarily unavailable')
  return <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
    <Link href="/dashboard" className="text-sm font-semibold text-primary">← Pilot dashboard</Link>
    <h1 className="mt-4 text-3xl font-extrabold">Your search alerts</h1>
    <p className="mt-3 text-muted-foreground">AeroTrade Premium includes new AeroTrade listing alerts and up to five saved searches. Search emails are sent daily only when there are new matches. External adverts are checked daily and link to their original marketplace.</p>
    {params.error?<p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">{params.error}</p>:null}
    {params.saved?<p role="status" className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4 text-green-900">Search saved. We will email you when new matches appear; existing results will not be sent.</p>:null}
    {!profile?.is_premium?<p className="mt-5 rounded-xl border p-4">Your saved searches are retained, but emails are paused while Premium is inactive. <Link href="/pricing" className="font-semibold text-primary">Get Premium for €9.99/year</Link>.</p>:null}
    <section className="mt-7 rounded-2xl border p-5"><h2 className="font-bold">New AeroTrade equipment</h2><p className="mt-2 text-sm text-muted-foreground">Email me when a new listing is published on AeroTrade, including free and assisted listings. Only promoted listings have a 48-hour early-access window.</p>
      <form action={setListingAlerts} className="mt-4 flex flex-col items-start gap-3"><label className="flex items-center gap-2"><input type="checkbox" name="enabled" value="yes" defaultChecked={profile?.listing_alerts_enabled} disabled={!profile?.is_premium}/>New listing alerts</label><button className="min-h-11 rounded-lg border px-4 py-2 font-semibold">Save preference</button></form>
    </section>
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Saved searches ({searches?.length||0}/5)</h2><Link href="/catalog" className="min-h-11 rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground">Find equipment &amp; save a search</Link></div>
    {!searches?.length?<p className="mt-5 rounded-xl border border-dashed p-6 text-muted-foreground">Search for a model, manufacturer, country or equipment category in the catalogue, then choose “Save search &amp; get alerts”.</p>:<ul className="mt-5 space-y-4">{searches.map(search=><li key={search.id} className="rounded-2xl border p-5"><Link href={savedSearchPath(search)} className="break-words font-bold text-primary">{savedSearchLabel(search)}</Link><p className="mt-2 text-sm text-muted-foreground">{search.active&&profile?.is_premium?'Alerts on':'Alerts paused'} · New matches only · Daily</p><div className="mt-4 flex flex-wrap gap-3"><form action={setSavedSearchActive.bind(null,search.id,!search.active)}><button disabled={!profile?.is_premium&&!search.active} className="min-h-11 rounded-lg border px-4 py-2 font-semibold disabled:opacity-50">{search.active?'Pause alerts':'Resume alerts'}</button></form><form action={deleteSavedSearch.bind(null,search.id)}><button className="min-h-11 rounded-lg px-4 py-2 text-sm text-muted-foreground underline">Remove search</button></form></div></li>)}</ul>}
  </div>
}
