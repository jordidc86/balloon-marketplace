'use client'

import { useActionState } from 'react'
import { CheckCircle2, Loader2, Share2, TriangleAlert } from 'lucide-react'
import ListingShare from '@/components/ListingShare'
import { submitSellerAvailabilityConfirmation, type SellerAvailabilityConfirmationState } from './actions'

const initialState: SellerAvailabilityConfirmationState = { success: false, message: '' }

type ConfirmableListing = { id: string; title: string }

export default function SellerAvailabilityConfirmationForm({ sellerId, digestKey, token, baseUrl, listings }: { sellerId: string; digestKey: string; token: string; baseUrl: string; listings: ConfirmableListing[] }) {
  const [state, formAction, pending] = useActionState(submitSellerAvailabilityConfirmation, initialState)
  const listingCount = listings.length

  if (state.success) {
    return <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"><CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" /><div><h2 className="font-semibold">Availability confirmed</h2><p className="mt-1 text-sm">{state.message}</p></div></div>
      <section className="rounded-xl border bg-card p-5">
        <div className="flex items-start gap-3"><Share2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h2 className="font-semibold">Put the confirmed listings in front of buyers</h2><p className="mt-1 text-sm text-muted-foreground">Choose any listing below to share it through your own network. Nothing is sent automatically; AeroTrade only measures visits to these seller-share links.</p></div></div>
        <div className="mt-4 divide-y rounded-xl border">
          {listings.map((listing) => <div key={listing.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="font-semibold">{listing.title}</p><ListingShare baseUrl={baseUrl} listingId={listing.id} title={listing.title} source="seller_share" compact /></div>)}
        </div>
      </section>
    </div>
  }

  return (
    <form action={formAction} className="space-y-4 rounded-xl border bg-card p-5">
      <input type="hidden" name="seller_id" value={sellerId} />
      <input type="hidden" name="digest_key" value={digestKey} />
      <input type="hidden" name="token" value={token} />
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="availability_confirmation" value="yes" required className="mt-1" />
        <span>I have reviewed the {listingCount} active advert{listingCount === 1 ? '' : 's'} shown above and confirm that {listingCount === 1 ? 'it is' : 'they are'} still available today.</span>
      </label>
      {state.message ? <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{state.message}</div> : null}
      <button disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Confirm all {listingCount} listed adverts</button>
    </form>
  )
}
