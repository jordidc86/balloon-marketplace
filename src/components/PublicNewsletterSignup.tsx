'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Mail } from 'lucide-react'
import { requestPublicNewsletterOptIn, type PublicNewsletterRequestState } from '@/app/newsletter/actions'
import CommercialAttributionFields from '@/components/CommercialAttributionFields'

const initialState: PublicNewsletterRequestState = { success: false, message: '' }

export default function PublicNewsletterSignup({ compact = false, sourceContext }: { compact?: boolean; sourceContext: 'home' | 'catalog' }) {
  const [state, action, pending] = useActionState(requestPublicNewsletterOptIn, initialState)
  return (
    <section className={`rounded-2xl border border-primary/20 bg-primary/5 ${compact ? 'p-5' : 'p-6 sm:p-8'}`}>
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
        <div>
          <h2 className="text-xl font-bold">See new balloon equipment without checking every day</h2>
          <p className="mt-1 text-sm text-muted-foreground">At most twice a month. A confirmation email is required, and every update has an immediate stop link.</p>
        </div>
      </div>
      {state.message ? <p className={`mt-4 rounded-lg border p-3 text-sm ${state.success ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}>{state.message}</p> : null}
      {!state.success ? (
        <form action={action} className="mt-5 space-y-3">
          <CommercialAttributionFields />
          <input type="hidden" name="source_context" value={sourceContext} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor={`newsletter-email-${compact ? 'compact' : 'full'}`}>Email address</label>
            <input id={`newsletter-email-${compact ? 'compact' : 'full'}`} name="email" type="email" autoComplete="email" required maxLength={320} placeholder="you@example.com" className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2.5" />
            <button disabled={pending} className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-primary-foreground disabled:opacity-50">{pending ? 'Requesting…' : 'Send confirmation'}</button>
          </div>
          <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          <label className="flex items-start gap-2 text-xs text-muted-foreground"><input name="privacy_consent" value="yes" type="checkbox" required className="mt-0.5" /><span>I ask AeroTrade to email me a confirmation for this optional marketplace newsletter and accept the <Link href="/privacy" className="underline">privacy notice</Link>. This request does not subscribe me yet.</span></label>
        </form>
      ) : null}
    </section>
  )
}
