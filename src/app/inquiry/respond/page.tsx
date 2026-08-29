import type { Metadata } from 'next'
import { createAdminClient } from '@/utils/supabase/server'
import { inquiryBuyerCapabilityLifetimeMs, verifyInquiryBuyerCapability } from '@/utils/inquiry-buyer-capability.mjs'
import BuyerInquiryResponseForm from './BuyerInquiryResponseForm'

export const metadata: Metadata = { title: 'Respond to negotiation | AeroTrade', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

type InquiryWithListing = {
  id: string
  buyer_email: string
  currency: string
  status: string
  listings: { title: string } | null
}

export default async function BuyerInquiryResponsePage({ searchParams }: { searchParams: Promise<{ id?: string; event?: string; token?: string }> }) {
  const params = await searchParams
  const id = params.id || ''
  const eventId = params.event || ''
  const token = params.token || ''
  const admin = await createAdminClient()
  const [{ data: inquiryData }, { data: targetEvent }, { data: existingResponse }] = await Promise.all([
    admin.from('marketplace_inquiries').select('id,buyer_email,currency,status,listings(title)').eq('id', id).maybeSingle(),
    admin.from('marketplace_inquiry_offer_events').select('id,inquiry_id,event_type,amount_minor,currency,note,created_at').eq('id', eventId).eq('inquiry_id', id).maybeSingle(),
    admin.from('marketplace_inquiry_offer_events').select('id,event_type').eq('responding_to_event_id', eventId).maybeSingle(),
  ])
  const inquiry = inquiryData as unknown as InquiryWithListing | null
  const expiresAt = targetEvent?.created_at ? new Date(new Date(targetEvent.created_at).getTime() + inquiryBuyerCapabilityLifetimeMs) : new Date(0)
  const authorized = Boolean(inquiry && targetEvent && ['SELLER_ACCEPTED_FOR_NEGOTIATION', 'SELLER_COUNTERED'].includes(targetEvent.event_type)
    && verifyInquiryBuyerCapability({ inquiryId: inquiry.id, eventId: targetEvent.id, buyerEmail: inquiry.buyer_email, expiresAt, secret: process.env.SUPABASE_SERVICE_ROLE_KEY, token }))

  if (!authorized || !inquiry || !targetEvent) {
    return <main className="mx-auto max-w-xl px-4 py-16"><div className="rounded-2xl border bg-card p-6"><h1 className="text-2xl font-bold">Negotiation link unavailable</h1><p className="mt-3 text-sm text-muted-foreground">This private link is invalid, expired or no longer corresponds to the current negotiation.</p></div></main>
  }

  const amount = targetEvent.amount_minor === null
    ? null
    : (Number(targetEvent.amount_minor) / 100).toLocaleString('en-IE', { style: 'currency', currency: targetEvent.currency })
  return (
    <main className="mx-auto max-w-xl space-y-5 px-4 py-16">
      <div className="rounded-2xl border bg-card p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Private AeroTrade negotiation</p>
        <h1 className="mt-2 text-2xl font-bold">{inquiry.listings?.title || 'Marketplace listing'}</h1>
        <p className="mt-3 text-sm">{targetEvent.event_type === 'SELLER_COUNTERED' ? <>The seller proposed a non-binding counteroffer of <strong>{amount}</strong>.</> : 'The seller wants to continue negotiating with you.'}</p>
        {targetEvent.note ? <p className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm"><strong>Seller note:</strong><br />{targetEvent.note}</p> : null}
        <p className="mt-3 text-xs text-muted-foreground">This page does not reserve the equipment, execute a payment or form a sale contract.</p>
      </div>
      {existingResponse ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-950">Your response to this seller update is already recorded.</div> : inquiry.status === 'LOST' ? <div className="rounded-xl border p-4 text-sm">This opportunity is closed.</div> : <BuyerInquiryResponseForm inquiryId={inquiry.id} eventId={targetEvent.id} token={token} currency={inquiry.currency} />}
    </main>
  )
}
