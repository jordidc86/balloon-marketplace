'use client'

import { useActionState } from 'react'
import { MailX } from 'lucide-react'
import { unsubscribePublicNewsletter, type NewsletterUnsubscribeState } from './actions'

const initialState: NewsletterUnsubscribeState = { success: false, message: '' }

export default function PublicNewsletterUnsubscribeForm({ subscription, token }: { subscription: string; token: string }) {
  const [state, action, pending] = useActionState(unsubscribePublicNewsletter, initialState)
  return <div className="rounded-2xl border bg-background p-8 shadow-sm"><div className="flex items-start gap-3"><MailX className="mt-0.5 h-6 w-6 shrink-0 text-primary" /><div><h1 className="text-2xl font-bold">Stop marketplace update emails</h1><p className="mt-2 text-sm text-muted-foreground">This stops only the optional newsletter and does not affect any enquiry, listing or alert.</p></div></div>{state.message ? <p className={`mt-5 rounded-lg border p-3 text-sm ${state.success ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}>{state.message}</p> : null}{!state.success ? <form action={action} className="mt-6"><input type="hidden" name="subscription" value={subscription} /><input type="hidden" name="token" value={token} /><button disabled={pending} className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-50">{pending ? 'Stopping emails…' : 'Stop marketplace updates'}</button></form> : null}</div>
}
