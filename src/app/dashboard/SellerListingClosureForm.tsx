'use client'

import { FormEvent, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { closeListingBySeller } from './actions'

type EligibleInquiry = { id: string; label: string }

export default function SellerListingClosureForm({
  listingId,
  currency,
  eligibleInquiries,
}: {
  listingId: string
  currency: string
  eligibleInquiries: EligibleInquiry[]
}) {
  const router = useRouter()
  const [saleChannel, setSaleChannel] = useState('')
  const [pendingAction, setPendingAction] = useState<'SOLD' | 'WITHDRAWN' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>, action: 'SOLD' | 'WITHDRAWN') => {
    event.preventDefault()
    if (!window.confirm(action === 'SOLD' ? 'Close this listing as sold?' : 'Withdraw this listing without reporting a sale?')) return
    setPendingAction(action)
    setError(null)
    try {
      await closeListingBySeller(listingId, new FormData(event.currentTarget))
      router.refresh()
    } catch {
      setError(action === 'SOLD'
        ? 'The sale report was not stored. Check the sale channel, enquiry and optional amount.'
        : 'The withdrawal was not stored. Please try again.')
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <details className="w-full max-w-80 rounded-lg border bg-muted/20 p-3 text-left">
      <summary className="cursor-pointer text-xs font-semibold">Close listing</summary>
      <div className="mt-3 space-y-4">
        <form onSubmit={(event) => submit(event, 'SOLD')} className="space-y-2">
          <input type="hidden" name="closure_action" value="SOLD" />
          <label className="block text-xs font-medium">Where was it sold?</label>
          <select name="sale_channel" required value={saleChannel} onChange={(event) => setSaleChannel(event.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-xs">
            <option value="" disabled>Select one</option>
            {eligibleInquiries.length > 0 ? <option value="AEROTRADE">Through an AeroTrade enquiry</option> : null}
            <option value="OTHER_CHANNEL">Through another channel</option>
            <option value="NOT_DISCLOSED">Prefer not to disclose</option>
          </select>
          {saleChannel === 'AEROTRADE' ? (
            <>
              <label className="block text-xs font-medium">Which AeroTrade enquiry led to the sale?</label>
              <select name="marketplace_inquiry_id" required defaultValue="" className="w-full rounded-lg border bg-background px-3 py-2 text-xs">
                <option value="" disabled>Select the enquiry</option>
                {eligibleInquiries.map((inquiry) => <option key={inquiry.id} value={inquiry.id}>{inquiry.label}</option>)}
              </select>
            </>
          ) : null}
          <label className="block text-xs font-medium">Final gross sale amount (optional, {currency})</label>
          <input name="gross_amount" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" placeholder="e.g. 24500" className="w-full rounded-lg border bg-background px-3 py-2 text-xs" />
          <p className="text-[11px] text-muted-foreground">This records your report for review. It does not create a payment or verified AeroTrade revenue.</p>
          <button disabled={pendingAction !== null} className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-60">{pendingAction === 'SOLD' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Mark sold</button>
        </form>
        <form onSubmit={(event) => submit(event, 'WITHDRAWN')}>
          <input type="hidden" name="closure_action" value="WITHDRAWN" />
          <button disabled={pendingAction !== null} className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-60">{pendingAction === 'WITHDRAWN' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Withdraw without a sale</button>
        </form>
        {error ? <p aria-live="polite" className="text-xs font-semibold text-destructive">{error}</p> : null}
      </div>
    </details>
  )
}
