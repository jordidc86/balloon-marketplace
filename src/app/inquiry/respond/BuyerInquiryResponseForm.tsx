'use client'

import { useActionState, useState } from 'react'
import { CheckCircle2, Loader2, MessageSquare, TriangleAlert } from 'lucide-react'
import { submitBuyerInquiryResponse, type BuyerInquiryResponseState } from './actions'

const initialState: BuyerInquiryResponseState = { success: false, message: '' }

export default function BuyerInquiryResponseForm({ inquiryId, eventId, token, currency }: { inquiryId: string; eventId: string; token: string; currency: string }) {
  const [response, setResponse] = useState<'ACCEPT' | 'COUNTER' | 'DECLINE'>('ACCEPT')
  const [state, formAction, pending] = useActionState(submitBuyerInquiryResponse, initialState)
  if (state.success) {
    return <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><p className="text-sm font-medium">{state.message}</p></div>
  }
  return (
    <form action={formAction} className="space-y-4 rounded-xl border bg-card p-5">
      <input type="hidden" name="id" value={inquiryId} />
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="token" value={token} />
      <div className="flex items-start gap-3"><MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h2 className="font-semibold">Your non-binding response</h2><p className="mt-1 text-xs text-muted-foreground">One response is accepted for this seller update. Nothing here reserves equipment or moves money.</p></div></div>
      <select name="response" value={response} onChange={(event) => setResponse(event.target.value as typeof response)} className="w-full rounded-lg border bg-background px-3 py-2">
        <option value="ACCEPT">Continue negotiating</option>
        <option value="COUNTER">Send a counteroffer</option>
        <option value="DECLINE">Decline this opportunity</option>
      </select>
      {response === 'COUNTER' ? <div className="flex rounded-lg border bg-background"><input name="counter_amount" required inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" placeholder="Counter amount" className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3 py-2 outline-none" /><span className="flex items-center border-l px-3 text-xs font-semibold text-muted-foreground">{currency}</span></div> : null}
      <textarea name="response_note" maxLength={1000} rows={3} placeholder="Optional note to the seller" className="w-full resize-y rounded-lg border bg-background px-3 py-2" />
      {state.message ? <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{state.message}</div> : null}
      <button disabled={pending} className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-semibold ${response === 'DECLINE' ? 'border border-destructive/30 text-destructive' : 'bg-primary text-primary-foreground'} disabled:opacity-60`}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{response === 'COUNTER' ? 'Record and send counteroffer' : response === 'DECLINE' ? 'Record and notify decline' : 'Record and continue negotiation'}</button>
    </form>
  )
}
