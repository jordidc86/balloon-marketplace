'use client'

import { FormEvent, useState } from 'react'
import { Loader2, Send, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { submitListingInquiry } from './actions'
import { getBrowserCommercialContext } from '@/utils/browser-attribution'

export default function BuyerInquiryForm({ listingId }: { listingId: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setResult(null)
    const form = event.currentTarget
    const response = await submitListingInquiry(listingId, new FormData(form), getBrowserCommercialContext())
    setResult({ success: response.success, message: response.message })
    if (response.success) form.reset()
    setIsSubmitting(false)
  }

  if (result?.success) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Enquiry recorded</p>
            <p className="mt-1 text-sm">{result.message}</p>
            <button type="button" onClick={() => setResult(null)} className="mt-3 text-sm font-semibold underline">
              Send another enquiry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h3 className="font-bold text-lg">Ask the seller</h3>
        <p className="text-sm text-muted-foreground mt-1">Your enquiry is recorded by AeroTrade so it cannot be lost.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="buyer_name" required minLength={2} maxLength={120} placeholder="Your name" className="rounded-lg border bg-background px-3 py-2" />
        <input name="buyer_email" type="email" required maxLength={320} placeholder="Email" className="rounded-lg border bg-background px-3 py-2" />
      </div>
      <input name="buyer_phone" maxLength={60} placeholder="Phone (optional)" className="w-full rounded-lg border bg-background px-3 py-2" />
      <textarea name="message" required minLength={20} maxLength={2000} rows={4} placeholder="Ask about availability, documentation, inspection or collection…" className="w-full resize-y rounded-lg border bg-background px-3 py-2" />
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input name="privacy_consent" value="yes" type="checkbox" required className="mt-0.5" />
        <span>I agree that AeroTrade stores this enquiry and shares my details with the seller under the <Link href="/privacy" className="underline">privacy notice</Link>.</span>
      </label>
      {result && !result.success ? <p className="text-sm text-destructive">{result.message}</p> : null}
      <button disabled={isSubmitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-70">
        {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        Send tracked enquiry
      </button>
    </form>
  )
}
