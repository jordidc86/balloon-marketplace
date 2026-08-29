import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Clock3, MessageSquare, ShieldCheck } from 'lucide-react'
import { createAdminClient } from '@/utils/supabase/server'
import {
  inquiryBuyerCapabilityLifetimeMs,
  isInquiryBuyerResponseWindowOpen,
  signInquiryBuyerCapability,
  verifyInquiryBuyerPortalCapability,
} from '@/utils/inquiry-buyer-capability.mjs'

export const metadata: Metadata = {
  title: 'Private enquiry status | AeroTrade',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  referrer: 'no-referrer',
}
export const dynamic = 'force-dynamic'

type InquiryRecord = {
  id: string
  buyer_email: string
  currency: string
  status: string
  message: string
  created_at: string
  last_activity_at: string
  closed_at: string | null
  listings: { id: string; title: string; status: string } | null
}

type NegotiationEvent = {
  id: string
  event_type: string
  actor_role: string
  amount_minor: number | null
  currency: string
  note: string | null
  responding_to_event_id: string | null
  created_at: string
}

const eventLabels: Record<string, string> = {
  BUYER_OFFERED: 'You made an indicative offer',
  SELLER_ACCEPTED_FOR_NEGOTIATION: 'The seller wants to continue negotiating',
  SELLER_COUNTERED: 'The seller made a counteroffer',
  SELLER_DECLINED: 'The seller declined this opportunity',
  BUYER_ACCEPTED_FOR_NEGOTIATION: 'You chose to continue negotiating',
  BUYER_COUNTERED: 'You made a counteroffer',
  BUYER_DECLINED: 'You declined this opportunity',
}

const statusCopy: Record<string, string> = {
  NEW: 'Your enquiry is safely recorded and awaiting seller attention.',
  SELLER_NOTIFIED: 'The seller notification was accepted and the enquiry is awaiting a response.',
  CONTACTED: 'Contact has started and the opportunity remains open.',
  QUALIFIED: 'The seller has marked this as a qualified opportunity.',
  NEGOTIATING: 'The buyer and seller are negotiating on a non-binding basis.',
  WON: 'This opportunity has been recorded as completed by AeroTrade.',
  LOST: 'This opportunity is closed without a recorded completion.',
  SPAM: 'This enquiry is closed.',
}

const formatDate = (value: string) => new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
}).format(new Date(value))

const formatAmount = (event: NegotiationEvent) => event.amount_minor === null
  ? null
  : (Number(event.amount_minor) / 100).toLocaleString('en-IE', { style: 'currency', currency: event.currency })

export default async function BuyerInquiryStatusPage({ searchParams }: { searchParams: Promise<{ id?: string; token?: string }> }) {
  const params = await searchParams
  const inquiryId = params.id || ''
  const token = params.token || ''
  const admin = await createAdminClient()
  const { data: inquiryData } = await admin
    .from('marketplace_inquiries')
    .select('id,buyer_email,currency,status,message,created_at,last_activity_at,closed_at,listings(id,title,status)')
    .eq('id', inquiryId)
    .maybeSingle()
  const inquiry = inquiryData as unknown as InquiryRecord | null
  const authorized = Boolean(inquiry && verifyInquiryBuyerPortalCapability({
    inquiryId: inquiry.id,
    buyerEmail: inquiry.buyer_email,
    secret: process.env.SUPABASE_SERVICE_ROLE_KEY,
    token,
  }))

  if (!authorized || !inquiry) {
    return <main className="mx-auto max-w-xl px-4 py-16"><div className="rounded-2xl border bg-card p-6"><h1 className="text-2xl font-bold">Private enquiry status unavailable</h1><p className="mt-3 text-sm text-muted-foreground">This link is invalid or expired. Use the most recent AeroTrade negotiation email, or contact support if the opportunity should still be open.</p></div></main>
  }

  const { data: eventRows } = await admin
    .from('marketplace_inquiry_offer_events')
    .select('id,event_type,actor_role,amount_minor,currency,note,responding_to_event_id,created_at')
    .eq('inquiry_id', inquiry.id)
    .order('created_at', { ascending: true })
  const events = (eventRows || []) as NegotiationEvent[]
  const latestEvent = events.at(-1) || null
  const latestHasResponse = latestEvent ? events.some((event) => event.responding_to_event_id === latestEvent.id) : false
  const latestIsActionable = Boolean(latestEvent
    && ['SELLER_ACCEPTED_FOR_NEGOTIATION', 'SELLER_COUNTERED'].includes(latestEvent.event_type)
    && !latestHasResponse
    && !['WON', 'LOST', 'SPAM'].includes(inquiry.status))
  const responseExpiresAt = latestEvent ? new Date(new Date(latestEvent.created_at).getTime() + inquiryBuyerCapabilityLifetimeMs) : new Date(0)
  const responseToken = latestIsActionable && isInquiryBuyerResponseWindowOpen(responseExpiresAt)
    ? signInquiryBuyerCapability({
        inquiryId: inquiry.id,
        eventId: latestEvent!.id,
        buyerEmail: inquiry.buyer_email,
        expiresAt: responseExpiresAt,
        secret: process.env.SUPABASE_SERVICE_ROLE_KEY,
      })
    : null
  const responseHref = responseToken && latestEvent
    ? `/inquiry/respond?id=${encodeURIComponent(inquiry.id)}&event=${encodeURIComponent(latestEvent.id)}&token=${encodeURIComponent(responseToken)}`
    : null

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-12 sm:py-16">
      <section className="rounded-2xl border bg-card p-6">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-primary" /><div><p className="text-xs font-bold uppercase tracking-wide text-primary">Private AeroTrade deal room</p><h1 className="mt-1 text-2xl font-bold">{inquiry.listings?.title || 'Marketplace enquiry'}</h1></div></div>
        <div className="mt-5 rounded-xl bg-muted/40 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{inquiry.status.replaceAll('_', ' ')}</span><span className="text-xs text-muted-foreground">Updated {formatDate(inquiry.last_activity_at)}</span></div><p className="mt-3 text-sm">{statusCopy[inquiry.status] || 'This opportunity remains recorded by AeroTrade.'}</p></div>
        {responseHref ? <Link href={responseHref} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground">Respond to the latest seller update <ArrowRight className="h-4 w-4" /></Link> : null}
        {latestIsActionable && !responseHref ? <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">The secure response window for the latest seller update has expired. The enquiry history remains available here.</p> : null}
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <div className="flex items-start gap-3"><MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h2 className="font-semibold">Enquiry and negotiation history</h2><p className="mt-1 text-xs text-muted-foreground">Stored in chronological order. Every price shown is non-binding.</p></div></div>
        <ol className="mt-5 space-y-4 border-l pl-5">
          <li className="relative"><span className="absolute -left-[29px] top-0.5 h-4 w-4 rounded-full border-4 border-background bg-primary" /><p className="font-semibold">You sent the enquiry</p><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{inquiry.message}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(inquiry.created_at)}</p></li>
          {events.map((event) => {
            const amount = formatAmount(event)
            return <li key={event.id} className="relative"><span className="absolute -left-[29px] top-0.5 h-4 w-4 rounded-full border-4 border-background bg-primary" /><p className="font-semibold">{eventLabels[event.event_type] || 'Negotiation updated'}{amount ? ` · ${amount}` : ''}</p>{event.note ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{event.note}</p> : null}<p className="mt-1 text-xs text-muted-foreground">{formatDate(event.created_at)}</p></li>
          })}
        </ol>
      </section>

      <section className="grid gap-3 rounded-2xl border bg-card p-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="flex items-start gap-3"><Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-semibold">What happens next?</p><p className="mt-1 text-sm text-muted-foreground">AeroTrade will retain the opportunity and delivery evidence. No status on this page reserves equipment, moves money or creates a sale contract.</p></div></div>
        {inquiry.listings?.id ? <Link href={`/catalog/${inquiry.listings.id}`} className="inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold">View listing <ArrowRight className="h-4 w-4" /></Link> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
      </section>
    </main>
  )
}
