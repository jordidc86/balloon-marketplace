'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { CheckCircle2, Handshake, Loader2 } from 'lucide-react'
import { getBrowserCommercialContext } from '@/utils/browser-attribution'
import { submitSellerAssistanceRequest } from './actions'

export default function SellerAssistanceForm({ defaultEmail = '' }: { defaultEmail?: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setResult(null)
    const form = event.currentTarget
    const response = await submitSellerAssistanceRequest(new FormData(form), getBrowserCommercialContext())
    setResult({ success: response.success, message: response.message })
    if (response.success) form.reset()
    setIsSubmitting(false)
  }

  if (result?.success) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950">
        <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" /><div><h2 className="font-bold">Assisted-sale request recorded</h2><p className="mt-1 text-sm leading-6">{result.message}</p></div></div>
        <div className="mt-5 flex flex-wrap gap-3"><Link href="/sell" className="rounded-lg bg-emerald-900 px-4 py-2 text-sm font-semibold text-white">Prepare the full listing now</Link><button type="button" onClick={() => setResult(null)} className="px-4 py-2 text-sm font-semibold underline">Record another item</button></div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <div><h2 className="text-2xl font-bold">Tell us what you may sell</h2><p className="mt-1 text-sm text-muted-foreground">A short private intake. Nothing is published until you complete and approve the normal listing.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium">Name *<input name="name" required minLength={2} maxLength={120} className="w-full rounded-lg border bg-background px-3 py-2" /></label>
        <label className="space-y-1.5 text-sm font-medium">Email *<input name="email" type="email" required maxLength={320} defaultValue={defaultEmail} className="w-full rounded-lg border bg-background px-3 py-2" /></label>
        <label className="space-y-1.5 text-sm font-medium">Phone<input name="phone" maxLength={60} className="w-full rounded-lg border bg-background px-3 py-2" /></label>
        <label className="space-y-1.5 text-sm font-medium">Equipment category *<select name="category" required defaultValue="" className="w-full rounded-lg border bg-background px-3 py-2"><option value="" disabled>Select one…</option><option value="complete">Complete balloon</option><option value="envelopes">Envelope</option><option value="baskets">Basket</option><option value="burners">Burner</option><option value="bottom-end">Bottom end</option><option value="cylinders">Cylinders</option><option value="other-equipment">Other equipment</option></select></label>
        <label className="space-y-1.5 text-sm font-medium">Manufacturer<input name="manufacturer" maxLength={120} placeholder="e.g. Cameron" className="w-full rounded-lg border bg-background px-3 py-2" /></label>
        <label className="space-y-1.5 text-sm font-medium">Model<input name="model" maxLength={120} placeholder="e.g. Z-105" className="w-full rounded-lg border bg-background px-3 py-2" /></label>
        <label className="space-y-1.5 text-sm font-medium">Year<input name="manufacture_year" type="number" min="1900" max="2200" className="w-full rounded-lg border bg-background px-3 py-2" /></label>
        <label className="space-y-1.5 text-sm font-medium">Equipment location<input name="location_country" maxLength={100} placeholder="Country" className="w-full rounded-lg border bg-background px-3 py-2" /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <label className="space-y-1.5 text-sm font-medium">Expected price, if known<input name="expected_price" inputMode="decimal" placeholder="Optional" className="w-full rounded-lg border bg-background px-3 py-2" /></label>
        <label className="space-y-1.5 text-sm font-medium">Currency<select name="currency" defaultValue="EUR" className="w-full rounded-lg border bg-background px-3 py-2"><option>EUR</option><option>GBP</option><option>USD</option></select></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1.5 text-sm font-medium">Documentation<select name="documentation_readiness" defaultValue="UNKNOWN" className="w-full rounded-lg border bg-background px-3 py-2"><option value="UNKNOWN">Not sure</option><option value="READY">Ready</option><option value="PARTIAL">Partly ready</option><option value="NOT_READY">Not ready</option></select></label>
        <label className="space-y-1.5 text-sm font-medium">Photos<select name="photo_readiness" defaultValue="UNKNOWN" className="w-full rounded-lg border bg-background px-3 py-2"><option value="UNKNOWN">Not sure</option><option value="READY">Ready</option><option value="PARTIAL">Some available</option><option value="NOT_READY">Not ready</option></select></label>
        <label className="space-y-1.5 text-sm font-medium">Timing<select name="timeline" defaultValue="EXPLORING" className="w-full rounded-lg border bg-background px-3 py-2"><option value="EXPLORING">Just exploring</option><option value="NOW">Ready now</option><option value="0_3_MONTHS">Within 3 months</option><option value="3_6_MONTHS">3–6 months</option></select></label>
      </div>
      <fieldset className="space-y-2"><legend className="text-sm font-medium">Where would help be useful?</legend><div className="grid gap-2 text-sm sm:grid-cols-2"><label className="flex gap-2"><input type="checkbox" name="help_needed" value="VALUATION" />Price guidance</label><label className="flex gap-2"><input type="checkbox" name="help_needed" value="LISTING_PREPARATION" />Preparing the listing</label><label className="flex gap-2"><input type="checkbox" name="help_needed" value="PHOTO_GUIDANCE" />Photo checklist</label><label className="flex gap-2"><input type="checkbox" name="help_needed" value="DOCUMENT_CHECK" />Document checklist</label></div></fieldset>
      <label className="block space-y-1.5 text-sm font-medium">Anything else?<textarea name="notes" maxLength={2000} rows={4} placeholder="Condition, hours, included equipment or what is holding the listing back…" className="w-full resize-y rounded-lg border bg-background px-3 py-2" /></label>
      <input name="company_website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <label className="flex items-start gap-2 text-xs text-muted-foreground"><input name="privacy_consent" value="yes" type="checkbox" required className="mt-0.5" /><span>I ask AeroTrade to store this private sale request and contact me about preparing a marketplace listing under the <Link href="/privacy" className="underline">privacy notice</Link>.</span></label>
      <p className="text-xs text-muted-foreground">AeroTrade will confirm any applicable service scope or fee before commitment. Submitting this form does not publish the equipment.</p>
      {result && !result.success ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{result.message}</p> : null}
      <button disabled={isSubmitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-70">{isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Handshake className="h-5 w-5" />}Ask AeroTrade to help me sell</button>
    </form>
  )
}

