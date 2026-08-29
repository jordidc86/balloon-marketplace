'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { CheckCircle2, Loader2, Radar } from 'lucide-react'
import { submitWantedRequest } from './actions'
import { getBrowserCommercialContext } from '@/utils/browser-attribution'

export default function WantedRequestForm({ initialCategory = '' }: { initialCategory?: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setResult(null)
    const form = event.currentTarget
    const response = await submitWantedRequest(new FormData(form), getBrowserCommercialContext())
    setResult({ success: response.success, message: response.message })
    if (response.success) form.reset()
    setIsSubmitting(false)
  }

  if (result?.success) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950">
        <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" /><div><h2 className="font-bold">Demand recorded</h2><p className="mt-1 text-sm leading-6">{result.message}</p></div></div>
        <div className="mt-5 flex flex-wrap gap-3"><Link href="/catalog" className="rounded-lg bg-emerald-900 px-4 py-2 text-sm font-semibold text-white">Browse current catalog</Link><Link href="/new-balloon" className="rounded-lg border border-emerald-800 px-4 py-2 text-sm font-semibold">Price a new balloon</Link><button type="button" onClick={() => setResult(null)} className="px-4 py-2 text-sm font-semibold underline">Record another need</button></div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <div><h2 className="text-2xl font-bold">Tell us what you need</h2><p className="mt-1 text-sm text-muted-foreground">AeroTrade records this privately and compares it with current supply.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium">Name *<input name="buyer_name" required minLength={2} maxLength={120} className="w-full rounded-lg border bg-background px-3 py-2" /></label>
        <label className="space-y-1.5 text-sm font-medium">Email *<input name="buyer_email" type="email" required maxLength={320} className="w-full rounded-lg border bg-background px-3 py-2" /></label>
        <label className="space-y-1.5 text-sm font-medium">Phone<input name="buyer_phone" maxLength={60} className="w-full rounded-lg border bg-background px-3 py-2" /></label>
        <label className="space-y-1.5 text-sm font-medium">Equipment category *<select name="category" required defaultValue={initialCategory} className="w-full rounded-lg border bg-background px-3 py-2"><option value="" disabled>Select one…</option><option value="complete">Complete balloon</option><option value="envelopes">Envelope</option><option value="baskets">Basket</option><option value="burners">Burner</option><option value="bottom-end">Bottom end</option><option value="cylinders">Cylinders</option><option value="other-equipment">Other equipment</option></select></label>
        <label className="space-y-1.5 text-sm font-medium sm:col-span-2">Location preference<input name="location_preference" maxLength={120} placeholder="e.g. Europe, UK or no preference" className="w-full rounded-lg border bg-background px-3 py-2" /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_140px]">
        <label className="space-y-1.5 text-sm font-medium">Minimum budget<input name="budget_min" type="number" min="0" step="1" inputMode="decimal" className="w-full rounded-lg border bg-background px-3 py-2" /></label>
        <label className="space-y-1.5 text-sm font-medium">Maximum budget<input name="budget_max" type="number" min="0" step="1" inputMode="decimal" className="w-full rounded-lg border bg-background px-3 py-2" /></label>
        <label className="space-y-1.5 text-sm font-medium">Currency<select name="currency" defaultValue="EUR" className="w-full rounded-lg border bg-background px-3 py-2"><option>EUR</option><option>GBP</option><option>USD</option></select></label>
      </div>
      <label className="block space-y-1.5 text-sm font-medium">Requirements *<textarea name="details" required minLength={20} maxLength={3000} rows={5} placeholder="Model, capacity, year, condition, documentation, timing or anything essential…" className="w-full resize-y rounded-lg border bg-background px-3 py-2" /></label>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <label className="flex items-start gap-2 text-sm"><input name="notify_on_match" value="yes" type="checkbox" className="mt-1" /><span>Email me if AeroTrade identifies suitable equipment. No marketing campaigns.</span></label>
      <label className="flex items-start gap-2 text-xs text-muted-foreground"><input name="privacy_consent" value="yes" type="checkbox" required className="mt-0.5" /><span>I agree that AeroTrade stores this demand request and uses it to identify relevant supply under the <Link href="/privacy" className="underline">privacy notice</Link>.</span></label>
      {result && !result.success ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{result.message}</p> : null}
      <button disabled={isSubmitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-70">{isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Radar className="h-5 w-5" />}Record what I need</button>
    </form>
  )
}
