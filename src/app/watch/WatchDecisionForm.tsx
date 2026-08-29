'use client'

import { useActionState } from 'react'
import { BellRing, BellOff, CheckCircle2, Loader2, TriangleAlert } from 'lucide-react'
import { confirmListingWatch, unsubscribeListingWatch, type WatchDecisionState } from './actions'

const initialState: WatchDecisionState = { success: false, message: '' }

export default function WatchDecisionForm({ mode, id, token }: { mode: 'confirm' | 'unsubscribe'; id: string; token: string }) {
  const action = mode === 'confirm' ? confirmListingWatch : unsubscribeListingWatch
  const [state, formAction, pending] = useActionState(action, initialState)
  const Icon = mode === 'confirm' ? BellRing : BellOff

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      {state.message ? (
        <div className={`mb-5 flex items-start gap-3 rounded-xl border p-4 ${state.success ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-destructive/30 bg-destructive/5 text-destructive'}`}>
          {state.success ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />}
          <p className="text-sm font-medium">{state.message}</p>
        </div>
      ) : null}
      {!state.success ? (
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="token" value={token} />
          <div className="flex items-start gap-3"><Icon className="mt-0.5 h-6 w-6 shrink-0 text-primary" /><div><h1 className="text-2xl font-bold">{mode === 'confirm' ? 'Confirm listing updates' : 'Stop listing updates'}</h1><p className="mt-2 text-sm text-muted-foreground">{mode === 'confirm' ? 'Activate alerts only when this listing materially changes. This does not subscribe you to marketing.' : 'Deactivate every future update for this individual listing.'}</p></div></div>
          <button disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-70">{pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}{mode === 'confirm' ? 'Confirm listing alerts' : 'Unsubscribe from this listing'}</button>
        </form>
      ) : null}
    </div>
  )
}
