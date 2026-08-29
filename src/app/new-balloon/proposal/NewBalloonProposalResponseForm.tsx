'use client'

import { useActionState, useState } from 'react'
import { CheckCircle2, Loader2, MessageSquare, TriangleAlert } from 'lucide-react'
import { submitNewBalloonProposalResponse, type NewBalloonProposalResponseState } from './actions'

const initialState: NewBalloonProposalResponseState = { success: false, message: '' }

export default function NewBalloonProposalResponseForm({ proposalId, token }: { proposalId: string; token: string }) {
  const [responseType, setResponseType] = useState<'INTERESTED' | 'QUESTION' | 'DECLINED'>('INTERESTED')
  const [state, formAction, pending] = useActionState(submitNewBalloonProposalResponse, initialState)

  if (state.success) {
    return <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><p className="text-sm font-medium">{state.message}</p></div>
  }

  return (
    <form action={formAction} className="space-y-4 rounded-xl border bg-card p-5">
      <input type="hidden" name="proposal_id" value={proposalId} />
      <input type="hidden" name="token" value={token} />
      <div className="flex items-start gap-3"><MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h2 className="font-semibold">Tell AeroTrade how to continue</h2><p className="mt-1 text-xs text-muted-foreground">One initial response is recorded for this proposal. It remains non-binding and does not reserve equipment or move money.</p></div></div>
      <select name="response_type" value={responseType} onChange={(event) => setResponseType(event.target.value as typeof responseType)} className="w-full rounded-lg border bg-background px-3 py-2">
        <option value="INTERESTED">I am interested — contact me to continue</option>
        <option value="QUESTION">I have a question</option>
        <option value="DECLINED">I am not interested in this proposal</option>
      </select>
      <textarea name="response_note" required={responseType === 'QUESTION'} minLength={responseType === 'QUESTION' ? 5 : undefined} maxLength={1000} rows={4} placeholder={responseType === 'QUESTION' ? 'Write your question' : 'Optional context for AeroTrade'} className="w-full resize-y rounded-lg border bg-background px-3 py-2" />
      {state.message ? <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{state.message}</div> : null}
      <button disabled={pending} className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-semibold ${responseType === 'DECLINED' ? 'border border-destructive/30 text-destructive' : 'bg-primary text-primary-foreground'} disabled:opacity-60`}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{responseType === 'INTERESTED' ? 'Record my interest' : responseType === 'QUESTION' ? 'Send my question' : 'Record that I am not interested'}</button>
    </form>
  )
}
