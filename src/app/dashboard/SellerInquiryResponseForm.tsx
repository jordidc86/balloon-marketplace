'use client'

import { FormEvent, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { respondToBuyerInquiry } from './actions'

export default function SellerInquiryResponseForm({ inquiryId, currency }: { inquiryId: string; currency: string }) {
  const [response, setResponse] = useState<'ACCEPT' | 'COUNTER' | 'DECLINE'>('ACCEPT')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPending(true)
    setResult(null)
    try {
      await respondToBuyerInquiry(inquiryId, new FormData(event.currentTarget))
      setResult({ success: true, message: 'Response stored and its buyer delivery result recorded.' })
    } catch {
      setResult({ success: false, message: 'The response could not be completed. Check the selected action and amount, then try again.' })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <p className="text-sm font-semibold">Respond through AeroTrade</p>
      <select name="response" value={response} onChange={(event) => setResponse(event.target.value as typeof response)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
        <option value="ACCEPT">Continue negotiating</option>
        <option value="COUNTER">Send a counteroffer</option>
        <option value="DECLINE">Decline this opportunity</option>
      </select>
      {response === 'COUNTER' ? (
        <div className="flex rounded-lg border bg-background">
          <input name="counter_amount" required inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" placeholder="Counter amount" className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3 py-2 text-sm outline-none" />
          <span className="flex items-center border-l px-3 text-xs font-semibold text-muted-foreground">{currency}</span>
        </div>
      ) : null}
      <textarea name="response_note" maxLength={1000} rows={2} placeholder="Optional note to the buyer" className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm" />
      <p className="text-xs text-muted-foreground">This records and emails a non-binding response. No reservation, payment or contract is created.</p>
      {result ? <p aria-live="polite" className={`text-xs font-medium ${result.success ? 'text-emerald-700' : 'text-destructive'}`}>{result.message}</p> : null}
      <button disabled={pending} className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${response === 'DECLINE' ? 'border border-destructive/30 bg-background text-destructive' : 'bg-primary text-primary-foreground'} disabled:opacity-60`}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {response === 'COUNTER' ? 'Record and send counteroffer' : response === 'DECLINE' ? 'Record and notify decline' : 'Record and continue negotiation'}
      </button>
    </form>
  )
}

