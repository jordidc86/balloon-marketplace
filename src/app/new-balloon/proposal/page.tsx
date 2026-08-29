import type { Metadata } from 'next'
import { createAdminClient } from '@/utils/supabase/server'
import { newBalloonProposalResponseExpiry, verifyNewBalloonProposalCapability } from '@/utils/new-balloon-proposal-capability.mjs'
import { newBalloonProposalResponseLabel } from '@/utils/new-balloon-proposal-response.mjs'
import NewBalloonProposalResponseForm from './NewBalloonProposalResponseForm'

export const metadata: Metadata = {
  title: 'Respond to new-balloon proposal | AeroTrade',
  robots: { index: false, follow: false, noarchive: true },
  referrer: 'no-referrer',
}
export const dynamic = 'force-dynamic'

type Proposal = {
  id: string
  quote_request_id: string
  manufacturer: string
  currency: string
  amount_min_minor: number
  amount_max_minor: number
  configuration_summary: string
  delivery_guidance: string
  valid_until: string
  terms: string | null
  delivery_status: string
}

export default async function NewBalloonProposalResponsePage({ searchParams }: { searchParams: Promise<{ id?: string; token?: string }> }) {
  const params = await searchParams
  const proposalId = params.id || ''
  const token = params.token || ''
  const admin = await createAdminClient()
  const { data: proposalData } = await admin
    .from('new_balloon_quote_proposals')
    .select('id,quote_request_id,manufacturer,currency,amount_min_minor,amount_max_minor,configuration_summary,delivery_guidance,valid_until,terms,delivery_status')
    .eq('id', proposalId)
    .maybeSingle()
  const proposal = proposalData as Proposal | null
  const [{ data: quote }, { data: existingResponse }] = proposal ? await Promise.all([
    admin.from('quote_requests').select('id,email,status').eq('id', proposal.quote_request_id).maybeSingle(),
    admin.from('new_balloon_proposal_response_events').select('id,response_type').eq('proposal_id', proposal.id).maybeSingle(),
  ]) : [{ data: null }, { data: null }]
  const expiresAt = proposal ? newBalloonProposalResponseExpiry(proposal.valid_until) : null
  const authorized = Boolean(proposal && quote && expiresAt && proposal.delivery_status === 'accepted' && !['WON', 'LOST'].includes(quote.status)
    && verifyNewBalloonProposalCapability({
      proposalId: proposal.id,
      quoteRequestId: proposal.quote_request_id,
      buyerEmail: quote.email,
      expiresAt,
      secret: process.env.SUPABASE_SERVICE_ROLE_KEY,
      token,
    }))

  if (!authorized || !proposal || !quote) {
    return <main className="mx-auto max-w-xl px-4 py-16"><div className="rounded-2xl border bg-card p-6"><h1 className="text-2xl font-bold">Proposal link unavailable</h1><p className="mt-3 text-sm text-muted-foreground">This private link is invalid, expired or no longer corresponds to an open AeroTrade proposal.</p></div></main>
  }

  const amount = `${(Number(proposal.amount_min_minor) / 100).toLocaleString('en-IE', { style: 'currency', currency: proposal.currency })}–${(Number(proposal.amount_max_minor) / 100).toLocaleString('en-IE', { style: 'currency', currency: proposal.currency })}`
  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-16">
      <div className="rounded-2xl border bg-card p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Private AeroTrade proposal</p>
        <h1 className="mt-2 text-2xl font-bold">Factory-new {proposal.manufacturer === 'pasha' ? 'Pasha' : 'Schroeder'} balloon</h1>
        <p className="mt-3 text-sm"><strong>Indicative range:</strong> {amount}</p>
        <p className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm"><strong>Configuration:</strong><br />{proposal.configuration_summary}</p>
        <p className="mt-3 text-sm"><strong>Delivery guidance:</strong> {proposal.delivery_guidance}</p>
        <p className="mt-2 text-sm"><strong>Valid for discussion until:</strong> {proposal.valid_until}</p>
        {proposal.terms ? <p className="mt-3 whitespace-pre-wrap text-sm"><strong>Conditions:</strong><br />{proposal.terms}</p> : null}
        <p className="mt-4 text-xs text-muted-foreground">This is an invitation to discuss configuration and price. It is not a binding factory quotation, reservation, order or sale contract.</p>
      </div>
      {existingResponse ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-950">Your response is already recorded: {newBalloonProposalResponseLabel(existingResponse.response_type)}.</div> : <NewBalloonProposalResponseForm proposalId={proposal.id} token={token} />}
    </main>
  )
}
