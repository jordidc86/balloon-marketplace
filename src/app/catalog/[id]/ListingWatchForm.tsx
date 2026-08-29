'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { BellRing, CheckCircle2, Loader2 } from 'lucide-react'
import { getBrowserCommercialContext } from '@/utils/browser-attribution'
import { submitListingWatch } from './watch-actions'

export default function ListingWatchForm({ listingId, defaultEmail = '' }: { listingId: string; defaultEmail?: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setResult(null)
    const response = await submitListingWatch(listingId, new FormData(event.currentTarget), getBrowserCommercialContext())
    setResult({ success: response.success, message: response.message })
    setIsSubmitting(false)
  }

  if (result?.success) {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
        <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Watch request recorded</p><p className="mt-1 text-sm">{result.message}</p></div></div>
      </div>
    )
  }

  return (
    <form id="listing-watch" onSubmit={handleSubmit} className="scroll-mt-24 space-y-3 rounded-xl border bg-muted/20 p-4">
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div><p className="font-semibold">Not ready to enquire? Watch this listing.</p><p className="mt-1 text-xs text-muted-foreground">After email confirmation, AeroTrade will notify you only if its price, availability, condition or location changes.</p></div>
      </div>
      <input name="email" type="email" required maxLength={320} defaultValue={defaultEmail} placeholder="Your email" className="w-full rounded-lg border bg-background px-3 py-2" />
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <label className="flex items-start gap-2 text-xs text-muted-foreground"><input name="privacy_consent" value="yes" type="checkbox" required className="mt-0.5" /><span>I ask AeroTrade to store this listing-specific alert under the <Link href="/privacy" className="underline">privacy notice</Link>. It is not a marketing subscription and every alert includes an unsubscribe link.</span></label>
      {result && !result.success ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{result.message}</p> : null}
      <button disabled={isSubmitting} className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-background px-4 py-2.5 font-semibold text-primary hover:bg-primary/5 disabled:opacity-70">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}Watch price and availability</button>
    </form>
  )
}
