'use client'

import { useActionState } from 'react'
import { MailCheck } from 'lucide-react'
import { confirmPublicNewsletterConsent, type NewsletterConsentState } from './actions'

const initialState: NewsletterConsentState = { success: false, message: '' }

export default function PublicNewsletterConsentForm({ subscription, cycle, expires, token }: { subscription: string; cycle: string; expires: string; token: string }) {
  const [state, action, pending] = useActionState(confirmPublicNewsletterConsent, initialState)
  return (
    <div className="rounded-2xl border bg-background p-8 shadow-sm">
      <div className="flex items-start gap-3"><MailCheck className="mt-0.5 h-6 w-6 shrink-0 text-primary" /><div><h1 className="text-2xl font-bold">Confirm AeroTrade marketplace updates</h1><p className="mt-2 text-sm text-muted-foreground">Opening this private page has not subscribed you. Confirm only if you requested the optional newsletter.</p></div></div>
      {state.message ? <p className={`mt-5 rounded-lg border p-3 text-sm ${state.success ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}>{state.message}</p> : null}
      {!state.success ? <form action={action} className="mt-6 space-y-4"><input type="hidden" name="subscription" value={subscription} /><input type="hidden" name="cycle" value={cycle} /><input type="hidden" name="expires" value={expires} /><input type="hidden" name="token" value={token} /><p className="text-xs text-muted-foreground">By confirming, you ask AeroTrade to send at most two marketplace updates per month. Every email contains an immediate stop link.</p><button disabled={pending} className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-50">{pending ? 'Confirming…' : 'Confirm marketplace updates'}</button></form> : null}
    </div>
  )
}
