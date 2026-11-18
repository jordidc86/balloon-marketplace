import Link from 'next/link'
import { BellRing } from 'lucide-react'
import { saveCatalogSearch } from '@/app/dashboard/searches/actions'

export default function SaveCatalogSearch({query,category,country,manufacturer,isPremium}:{query:string;category:string;country:string;manufacturer:string;isPremium:boolean}) {
  if(!query&&!category&&!country&&!manufacturer) return null
  return <section className="mb-6 rounded-2xl border border-orange-200 bg-orange-50/70 p-4 sm:p-5">
    <div className="flex items-start gap-3"><BellRing className="mt-0.5 h-5 w-5 shrink-0 text-orange-700"/><div className="min-w-0 flex-1">
      <h2 className="font-bold">Looking for something like this?</h2>
      <p className="mt-1 text-sm text-muted-foreground">Save this search with AeroTrade Premium. Get a daily email when we find new matches on AeroTrade or the other marketplaces we review.</p>
      {isPremium?<form action={saveCatalogSearch} className="mt-3 flex flex-col items-start gap-3">
        <input type="hidden" name="query" value={query}/><input type="hidden" name="category" value={category}/><input type="hidden" name="country" value={country}/><input type="hidden" name="manufacturer" value={manufacturer}/>
        <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" name="alerts_consent" value="yes" required/><span>Email me new matches for this search. I can stop these alerts at any time.</span></label>
        <button className="min-h-11 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground">Save search &amp; get alerts</button>
      </form>:<Link href="/pricing" className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Get Premium · €9.99/year</Link>}
      <p className="mt-2 text-xs text-muted-foreground">Up to five searches. Existing results are your starting point; alerts begin with new matches.</p>
    </div></div>
  </section>
}
